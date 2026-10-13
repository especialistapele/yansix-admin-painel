import { performance } from "node:perf_hooks";
import { STATES } from "./engine.mjs";

const API_BASE = "https://api.neo4j.io";
export const NEO4J_RECOVERY_STATES = Object.freeze({ RATE_LIMITED: "rate_limited", AUTHENTICATION_ERROR: STATES.AUTHENTICATION_ERROR, UNAVAILABLE: STATES.UNAVAILABLE, TIMEOUT: STATES.TIMEOUT, UNKNOWN: STATES.UNKNOWN });
function unwrapInstance(body) {
  let current = body;
  for (let depth = 0; depth < 6; depth += 1) {
    if (Array.isArray(current)) {
      current = current[0];
      continue;
    }
    if (!current || typeof current !== "object") break;
    if (current.instance && typeof current.instance === "object") { current = current.instance; continue; }
    if (current.data && (typeof current.data === "object" || Array.isArray(current.data))) { current = current.data; continue; }
    break;
  }
  return current;
}
function readProviderState(value, depth = 0) {
  if (depth > 6 || value == null) return "";
  if (Array.isArray(value)) {
    for (const item of value) { const found = readProviderState(item, depth + 1); if (found) return found; }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["status", "state"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  for (const key of ["data", "instance", "instances", "result"]) {
    if (value[key] && typeof value[key] === "object") {
      const found = readProviderState(value[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}
async function token(service, fetchImpl) {
  const basic = Buffer.from(`${service.clientId}:${service.clientSecret}`).toString("base64");
  const response = await fetchImpl(`${API_BASE}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(service.recovery?.timeoutMs || 15000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) { const error = new Error("Aura authentication failed"); error.status = response.status; throw error; }
  return body.access_token;
}
export function createNeo4jAuraRecoveryAdapter({ fetchImpl = fetch, sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  return async function resumeNeo4jAura(service) {
    if (!service.clientId || !service.clientSecret || !service.instanceId) return { state: STATES.CONFIGURATION_ERROR, reason: "aura_management_credentials_missing" };
    const started = performance.now();
    try {
      const accessToken = await token(service, fetchImpl);
      const baseHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" };
      const resumeResponse = await fetchImpl(`${API_BASE}/v1/instances/${encodeURIComponent(service.instanceId)}/resume`, { method: "POST", headers: baseHeaders, signal: AbortSignal.timeout(service.recovery?.timeoutMs || 15000) });
      if (resumeResponse.status === 401 || resumeResponse.status === 403) return { state: NEO4J_RECOVERY_STATES.AUTHENTICATION_ERROR, status: resumeResponse.status, reason: "aura_resume_authentication_or_permission" };
      if (resumeResponse.status === 429) return { state: NEO4J_RECOVERY_STATES.RATE_LIMITED, status: resumeResponse.status, reason: "aura_resume_rate_limited" };
      if (!resumeResponse.ok) return { state: resumeResponse.status >= 500 ? NEO4J_RECOVERY_STATES.UNAVAILABLE : NEO4J_RECOVERY_STATES.UNKNOWN, status: resumeResponse.status, reason: "aura_resume_request_failed" };
      const attempts = Math.max(1, service.recovery?.maxAttempts || 1), delay = Math.max(0, service.recovery?.verifyDelayMs || 0);
      let verification = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (delay > 0) await sleepImpl(delay);
        const response = await fetchImpl(`${API_BASE}/v1/instances/${encodeURIComponent(service.instanceId)}`, { method: "GET", headers: baseHeaders, signal: AbortSignal.timeout(service.recovery?.timeoutMs || 15000) });
        const body = await response.json().catch(() => null), instance = unwrapInstance(body);
        const state = readProviderState(instance).toUpperCase();
        verification = { attempt, status: response.status, providerState: state || null };
        if (response.ok && ["RUNNING", "ACTIVE", "ONLINE"].includes(state)) return { state: STATES.HEALTHY, status: resumeResponse.status, reason: "aura_instance_resumed_and_running", providerState: state, verificationAttempt: attempt, latencyMs: Math.round(performance.now() - started) };
      }
      return { state: STATES.RECOVERY_FAILED, status: resumeResponse.status, reason: "aura_resume_requested_but_instance_not_running", verification, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      const name = error?.name || "Error";
      return { state: error?.status === 401 || error?.status === 403 ? NEO4J_RECOVERY_STATES.AUTHENTICATION_ERROR : name === "TimeoutError" || name === "AbortError" ? NEO4J_RECOVERY_STATES.TIMEOUT : NEO4J_RECOVERY_STATES.UNAVAILABLE, status: error?.status ?? null, error: name, reason: "aura_resume_request_failed" };
    }
  };
}
