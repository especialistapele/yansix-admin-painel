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
 * The restore endpoint remains provider-validated configuration.
 * Current Supabase public documentation confirms Dashboard resume,
 * but does not document the planned POST /v1/projects/{ref}/restore
 * endpoint used by the original design.
 *
 * This adapter is therefore not wired into main.mjs yet.
 * A real recovery call must only be enabled after endpoint, method,
 * permission and response behavior are confirmed.
 */
export function createSupabaseRecoveryAdapter({
  fetchImpl = fetch,
  restoreEndpoint = "https://api.supabase.com/v1/projects/{ref}/restore"
} = {}) {
  return async function requestRestore(service) {
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

      return {
        state: RECOVERY_STATES.REQUESTED,
        status: response.status,
        reason: "restore_requested",
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
