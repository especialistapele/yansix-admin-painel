import { performance } from "node:perf_hooks";
import { STATES } from "./engine.mjs";

export const RECOVERY_STATES = Object.freeze({
  REQUESTED: "restore_requested",
  RATE_LIMITED: "rate_limited",
  AUTHENTICATION_ERROR: STATES.AUTHENTICATION_ERROR,
  UNAVAILABLE: STATES.UNAVAILABLE,
  TIMEOUT: STATES.TIMEOUT,
  UNKNOWN: STATES.UNKNOWN
});

/*
 * Supabase documents project restoration as a Management API capability
 * requiring Project Settings read-write permission. The endpoint used here
 * is POST /v1/projects/{ref}/restore. A separate verification call is
 * performed after the restore request before the watchdog reports success.
 */
export function createSupabaseRecoveryAdapter({
  fetchImpl = fetch,
  restoreEndpoint = "https://api.supabase.com/v1/projects/{ref}/restore",
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  return async function requestRestore(service) {
    const verifyEndpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(service.projectRef)}`;
    const token = service.managementToken;
    const projectRef = service.projectRef;

    if (!token || !projectRef) {
      return {
        state: STATES.CONFIGURATION_ERROR,
        reason: "management_credentials_missing"
      };
    }

    const url = restoreEndpoint.replace("{ref}", encodeURIComponent(projectRef));
    const started = performance.now();

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(service.recovery?.timeoutMs || 15000)
      });

      if (response.status === 401 || response.status === 403) {
        return {
          state: RECOVERY_STATES.AUTHENTICATION_ERROR,
          status: response.status,
          reason: "restore_authentication_or_permission",
          latencyMs: Math.round(performance.now() - started)
        };
      }

      if (response.status === 429) {
        return {
          state: RECOVERY_STATES.RATE_LIMITED,
          status: response.status,
          reason: "restore_rate_limited",
          latencyMs: Math.round(performance.now() - started)
        };
      }

      if (!response.ok) {
        return {
          state: response.status >= 500
            ? RECOVERY_STATES.UNAVAILABLE
            : RECOVERY_STATES.UNKNOWN,
          status: response.status,
          reason: "restore_request_failed",
          latencyMs: Math.round(performance.now() - started)
        };
      }

      const attempts = Math.max(1, service.recovery?.maxAttempts || 1);
      const verifyDelayMs = Math.max(0, service.recovery?.verifyDelayMs || 0);
      let verification = null;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (attempt > 1 || verifyDelayMs > 0) {
          await sleepImpl(verifyDelayMs);
        }

        const verifyResponse = await fetchImpl(verifyEndpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
          },
          signal: AbortSignal.timeout(service.recovery?.timeoutMs || 15000)
        });

        let body = null;
        try {
          const text = await verifyResponse.text();
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }

        verification = {
          attempt,
          status: verifyResponse.status,
          providerState: body?.status ?? body?.state ?? null
        };

        if (verifyResponse.ok && verification.providerState === "ACTIVE_HEALTHY") {
          return {
            state: STATES.HEALTHY,
            status: response.status,
            reason: "project_restored_and_healthy",
            providerState: verification.providerState,
            verificationAttempt: attempt,
            latencyMs: Math.round(performance.now() - started)
          };
        }
      }

      return {
        state: STATES.RECOVERY_FAILED,
        status: response.status,
        reason: "restore_requested_but_project_not_healthy",
        verification,
        latencyMs: Math.round(performance.now() - started)
      };
    } catch (error) {
      const name = error?.name || "Error";
      return {
        state: name === "TimeoutError" || name === "AbortError"
          ? RECOVERY_STATES.TIMEOUT
          : RECOVERY_STATES.UNAVAILABLE,
        error: name,
        reason: "restore_request_failed"
      };
    }
  };
}
