import { performance } from "node:perf_hooks";
import { STATES } from "./engine.mjs";

const API_BASE = "https://api.neo4j.io";

async function getAccessToken(service, fetchImpl) {
  const credentials = Buffer.from(`${service.clientId}:${service.clientSecret}`).toString("base64");
  const response = await fetchImpl(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(service.timeoutMs || 15000)
  });

  let body = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {}

  if (!response.ok || !body?.access_token) {
    const error = new Error("Aura authentication failed");
    error.status = response.status;
    throw error;
  }
  return body.access_token;
}

function normalizeInstances(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.instances)) return body.instances;
  return [];
}

function classify(instance, status = 200) {
  const providerState = String(instance?.status ?? instance?.state ?? "").toUpperCase();
  if (["RUNNING", "ACTIVE", "ONLINE"].includes(providerState)) {
    return { state: STATES.HEALTHY, status, providerState, reason: "aura_instance_running" };
  }
  if (["PAUSED", "INACTIVE"].includes(providerState)) {
    return { state: STATES.PAUSED, status, providerState, reason: "aura_instance_paused" };
  }
  return { state: STATES.UNKNOWN, status, providerState: providerState || null, reason: "aura_instance_unknown_state" };
}

export function createNeo4jAuraAdapter({ fetchImpl = fetch } = {}) {
  return async function checkNeo4jAura(service) {
    if (!service.clientId || !service.clientSecret || !service.instanceId) {
      return { state: STATES.CONFIGURATION_ERROR, reason: "aura_management_credentials_missing" };
    }

    const started = performance.now();
    try {
      const token = await getAccessToken(service, fetchImpl);
      const response = await fetchImpl(
        `${API_BASE}/v1/instances/${encodeURIComponent(service.instanceId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(service.timeoutMs || 15000)
        }
      );

      let body = null;
      try {
        const text = await response.text();
        body = text ? JSON.parse(text) : null;
      } catch {}

      if (response.status === 401 || response.status === 403) {
        return { state: STATES.AUTHENTICATION_ERROR, status: response.status, reason: "aura_management_api_authentication", latencyMs: Math.round(performance.now() - started) };
      }
      if (response.status === 429) {
        return { state: STATES.UNKNOWN, status: response.status, reason: "aura_management_api_rate_limited", latencyMs: Math.round(performance.now() - started) };
      }
      if (!response.ok) {
        return { state: response.status >= 500 ? STATES.UNAVAILABLE : STATES.UNKNOWN, status: response.status, reason: "aura_management_api_error", latencyMs: Math.round(performance.now() - started) };
      }

      return { ...classify(body, response.status), latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      const name = error?.name || "Error";
      return {
        state: error?.status === 401 || error?.status === 403 ? STATES.AUTHENTICATION_ERROR :
          name === "TimeoutError" || name === "AbortError" ? STATES.TIMEOUT : STATES.UNAVAILABLE,
        status: error?.status ?? null,
        error: name,
        reason: "aura_management_api_request_failed",
        latencyMs: Math.round(performance.now() - started)
      };
    }
  };
}
