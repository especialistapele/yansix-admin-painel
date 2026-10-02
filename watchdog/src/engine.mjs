import { performance } from "node:perf_hooks";

export const STATES = Object.freeze({
  HEALTHY: "healthy",
  UNAVAILABLE: "unavailable",
  PAUSED: "paused",
  AUTHENTICATION_ERROR: "authentication_error",
  TIMEOUT: "timeout",
  CONFIGURATION_ERROR: "configuration_error",
  UNKNOWN: "unknown"
});

export function classifyHttp(status) {
  if (status >= 200 && status < 400) return STATES.HEALTHY;
  if (status === 401 || status === 403) return STATES.AUTHENTICATION_ERROR;
  if (status === 540) return STATES.PAUSED;
  if (status >= 500) return STATES.UNAVAILABLE;
  return STATES.UNKNOWN;
}

export async function checkHttpService(service, fetchImpl = fetch) {
  const url = service.url;
  if (!url) {
    return { state: STATES.CONFIGURATION_ERROR, reason: "missing_url" };
  }

  const started = performance.now();
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: service.headers || {},
      signal: AbortSignal.timeout(service.timeoutMs || 10000)
    });
    return {
      state: classifyHttp(response.status),
      status: response.status,
      latencyMs: Math.round(performance.now() - started)
    };
  } catch (error) {
    const name = error?.name || "Error";
    return {
      state: name === "TimeoutError" || name === "AbortError"
        ? STATES.TIMEOUT
        : STATES.UNAVAILABLE,
      error: name,
      latencyMs: Math.round(performance.now() - started)
    };
  }
}

export async function runChecks(services, adapters) {
  const results = [];
  for (const service of services) {
    if (!service.enabled) {
      results.push({
        id: service.id,
        name: service.name,
        provider: service.provider,
        state: STATES.CONFIGURATION_ERROR,
        reason: "disabled"
      });
      continue;
    }

    const adapter = adapters[service.provider];
    if (!adapter) {
      results.push({
        id: service.id,
        name: service.name,
        provider: service.provider,
        state: STATES.UNKNOWN,
        reason: "adapter_not_implemented"
      });
      continue;
    }

    results.push({
      id: service.id,
      name: service.name,
      provider: service.provider,
      ...(await adapter(service))
    });
  }
  return results;
}
