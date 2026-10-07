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
      const explicitlyEnabled = service.enabled === true;
      const enabled = explicitlyEnabled && (managementReady || httpReady);

      return {
        ...service,
        enabled,
        configurationState: enabled
          ? "ready"
          : explicitlyEnabled
            ? "credentials_pending"
            : "disabled",
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

      const ready =
        service.enabled === true &&
        Boolean(uri && username && password);

      return {
        ...service,
        enabled: ready,
        configurationState: ready
          ? "ready"
          : service.enabled === true
            ? "credentials_pending"
            : "disabled",
        uri,
        username,
        password,
        database
      };
    }

    return {
      ...service,
      enabled: service.enabled === true,
      configurationState:
        service.enabled === true ? "ready" : "disabled"
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
