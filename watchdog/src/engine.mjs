import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export const STATES = Object.freeze({
  HEALTHY: "healthy",
  UNAVAILABLE: "unavailable",
  PAUSED: "paused",
  AUTHENTICATION_ERROR: "authentication_error",
  TIMEOUT: "timeout",
  CONFIGURATION_ERROR: "configuration_error",
  RECOVERY_REQUESTED: "recovery_requested",
  RECOVERED: "recovered",
  RECOVERY_FAILED: "recovery_failed",
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
  if (!url) return { state: STATES.CONFIGURATION_ERROR, reason: "missing_url" };

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

export function createExecutionContext() {
  return {
    executionId: randomUUID(),
    startedAt: new Date().toISOString()
  };
}

export function normalizeResult(service, result, execution) {
  return {
    executionId: execution.executionId,
    serviceId: service.id,
    name: service.name,
    provider: service.provider,
    state: result.state || STATES.UNKNOWN,
    status: result.status ?? null,
    latencyMs: result.latencyMs ?? null,
    reason: result.reason ?? null,
    error: result.error ?? null,
    checkedAt: new Date().toISOString()
  };
}

export async function runChecks(services, adapters, execution = createExecutionContext()) {
  const results = [];
  for (const service of services) {
    if (!service.enabled) {
      results.push(normalizeResult(service, {
        state: STATES.CONFIGURATION_ERROR,
        reason: service.configurationState === "credentials_pending"
          ? "credentials_pending"
          : "disabled"
      }, execution));
      continue;
    }

    const adapter = adapters[service.provider];
    if (!adapter) {
      results.push(normalizeResult(service, {
        state: STATES.UNKNOWN,
        reason: "adapter_not_implemented"
      }, execution));
      continue;
    }

    try {
      results.push(normalizeResult(service, await adapter(service), execution));
    } catch (error) {
      results.push(normalizeResult(service, {
        state: STATES.UNKNOWN,
        error: error?.name || "AdapterError",
        reason: "adapter_exception"
      }, execution));
    }
  }

  return { execution, results };
}
