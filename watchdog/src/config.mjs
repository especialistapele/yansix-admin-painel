import { STATES } from "./engine.mjs";

export function resolveServices(config, env = process.env) {
  return config.services.map((service) => {
    if (service.provider === "supabase") {
      const url = service.url || (service.url_env ? env[service.url_env] : undefined);
      const key = service.key || (service.key_env ? env[service.key_env] : undefined);
      const managementToken = service.management_token_env
        ? env[service.management_token_env]
        : undefined;

      const managementReady = Boolean(managementToken && service.project_ref);
      const httpReady = Boolean(url && key);

      return {
        ...service,
        enabled: Boolean(service.enabled !== false && (managementReady || httpReady)),
        configurationState: managementReady || httpReady
          ? "ready"
          : "credentials_pending",
        url,
        headers: key ? { apikey: key } : undefined,
        managementToken
      };
    }

    if (service.provider === "neo4j_aura") {
      const uri = service.uri_env ? env[service.uri_env] : undefined;
      const username = service.username_env ? env[service.username_env] : undefined;
      const password = service.password_env ? env[service.password_env] : undefined;
      const database = service.database_env ? env[service.database_env] : undefined;

      const ready = Boolean(uri && username && password);

      return {
        ...service,
        enabled: Boolean(service.enabled !== false && ready),
        configurationState: ready ? "ready" : "credentials_pending",
        uri,
        username,
        password,
        database
      };
    }

    return {
      ...service,
      enabled: service.enabled !== false,
      configurationState: service.enabled === false ? "disabled" : "ready"
    };
  });
}

export function configurationSummary(services) {
  return services.map((service) => ({
    serviceId: service.id,
    name: service.name,
    provider: service.provider,
    enabled: service.enabled,
    configurationState: service.configurationState
  }));
}

export function configurationResult(service) {
  return {
    state: service.configurationState === "disabled"
      ? STATES.CONFIGURATION_ERROR
      : STATES.CONFIGURATION_ERROR,
    reason: service.configurationState === "credentials_pending"
      ? "credentials_pending"
      : "service_disabled"
  };
}
