export function canRecover(service, result) {
  if (!service.recovery?.enabled) {
    return { allowed: false, reason: "recovery_disabled" };
  }

  if (service.enabled !== true) {
    return { allowed: false, reason: "service_disabled" };
  }

  if (service.provider !== "supabase") {
    return { allowed: false, reason: "provider_not_supported" };
  }

  if (result.state !== "paused") {
    return { allowed: false, reason: "state_not_recoverable" };
  }

  if (!service.projectRef || !service.managementToken) {
    return { allowed: false, reason: "management_credentials_missing" };
  }

  const allowedRefs = service.recovery.allowProjectRefs;
  if (Array.isArray(allowedRefs) && !allowedRefs.includes(service.projectRef)) {
    return { allowed: false, reason: "project_not_allowlisted" };
  }

  return {
    allowed: true,
    reason: "paused_project_restore_authorized"
  };
}

export function recoveryPolicySummary(service) {
  return {
    serviceId: service.id,
    enabled: Boolean(service.recovery?.enabled),
    maxAttempts: service.recovery?.maxAttempts ?? 1,
    timeoutMs: service.recovery?.timeoutMs ?? 15000,
    verifyDelayMs: service.recovery?.verifyDelayMs ?? 10000,
    allowProjectRefs: Array.isArray(service.recovery?.allowProjectRefs)
      ? [...service.recovery.allowProjectRefs]
      : []
  };
}
