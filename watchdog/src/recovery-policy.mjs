export function canRecover(service, result) {
  if (!service.recovery?.enabled) {
    return { allowed: false, reason: "recovery_disabled" };
  }

  if (service.enabled !== true) {
    return { allowed: false, reason: "service_disabled" };
  }

  if (!["supabase", "neo4j_aura"].includes(service.provider)) {
    return { allowed: false, reason: "provider_not_supported" };
  }

  if (result.state !== "paused") {
    return { allowed: false, reason: "state_not_recoverable" };
  }

  if (service.provider === "supabase" && (!service.projectRef || !service.managementToken)) {
    return { allowed: false, reason: "management_credentials_missing" };
  }

  if (service.provider === "neo4j_aura" && (!service.uri || !service.clientId || !service.clientSecret)) {
    return { allowed: false, reason: "management_credentials_missing" };
  }

  const allowlist = service.recovery.allowProjectRefs;
  const targetId = service.provider === "supabase" ? service.projectRef : service.instanceId;
  if (Array.isArray(allowlist) && allowlist.length > 0 && !allowlist.includes(targetId)) {
    return { allowed: false, reason: "target_not_allowlisted" };
  }

  return {
    allowed: true,
    reason: service.provider === "neo4j_aura"
      ? "paused_instance_resume_authorized"
      : "paused_project_restore_authorized"
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
