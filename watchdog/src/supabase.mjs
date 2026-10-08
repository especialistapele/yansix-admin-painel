import { performance } from "node:perf_hooks";
import { checkHttpService, STATES } from "./engine.mjs";

export function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return null;
  }
}

export function createSupabaseAdapter({ fetchImpl = fetch } = {}) {
  return async function checkSupabase(service) {
    const managementToken = service.managementToken;
    const projectRef = service.projectRef || projectRefFromUrl(service.url);

    if (managementToken && projectRef) {
      const started = performance.now();
      try {
        const response = await fetchImpl(
          "https://api.supabase.com/v1/projects",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${managementToken}`,
              Accept: "application/json"
            },
            signal: AbortSignal.timeout(service.timeoutMs || 10000)
          }
        );

        const bodyText = await response.text();
        let body = null;
        try {
          body = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          body = null;
        }

        if (response.status === 401 || response.status === 403) {
          return {
            state: STATES.AUTHENTICATION_ERROR,
            status: response.status,
            reason: "management_api_authentication",
            latencyMs: Math.round(performance.now() - started)
          };
        }

        if (response.status === 429) {
          return {
            state: STATES.UNKNOWN,
            status: response.status,
            reason: "management_api_rate_limited",
            latencyMs: Math.round(performance.now() - started)
          };
        }

        if (!response.ok) {
          return {
            state: response.status >= 500 ? STATES.UNAVAILABLE : STATES.UNKNOWN,
            status: response.status,
            reason: "management_api_error",
            apiMessage: typeof body?.message === "string" ? body.message.slice(0, 200) : null,
            latencyMs: Math.round(performance.now() - started)
          };
        }

        const projects = Array.isArray(body) ? body : Array.isArray(body?.projects) ? body.projects : [];
        const project = projects.find((item) => item?.ref === projectRef);
        const providerState = project?.status ?? null;

        if (!project) {
          return {
            state: STATES.UNKNOWN,
            status: response.status,
            reason: "management_api_project_not_found",
            latencyMs: Math.round(performance.now() - started)
          };
        }

        if (providerState === "INACTIVE" || providerState === "PAUSED") {
          return {
            state: STATES.PAUSED,
            status: response.status,
            reason: "management_api_project_paused",
            providerState,
            latencyMs: Math.round(performance.now() - started)
          };
        }

        if (providerState === "ACTIVE_HEALTHY") {
          return {
            state: STATES.HEALTHY,
            status: response.status,
            reason: "management_api_active_healthy",
            providerState,
            latencyMs: Math.round(performance.now() - started)
          };
        }

        return {
          state: STATES.UNKNOWN,
          status: response.status,
          reason: "management_api_unknown_project_state",
          providerState,
          latencyMs: Math.round(performance.now() - started)
        };
      } catch (error) {
        const name = error?.name || "Error";
        return {
          state: name === "TimeoutError" || name === "AbortError"
            ? STATES.TIMEOUT
            : STATES.UNAVAILABLE,
          error: name,
          reason: "management_api_request_failed"
        };
      }
    }

    return checkHttpService(service, fetchImpl);
  };
}
