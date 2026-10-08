import test from "node:test";
import assert from "node:assert/strict";
import { resolveServices, configurationSummary } from "../src/config.mjs";

test("mantém serviço explicitamente desabilitado como disabled sem credenciais", () => {
  const config = {
    services: [{
      id: "supabase-test",
      name: "Teste",
      provider: "supabase",
      enabled: false,
      project_ref: "abc123",
      management_token_env: "WATCHDOG_TEST_TOKEN",
      url_env: "WATCHDOG_TEST_URL",
      key_env: "WATCHDOG_TEST_KEY"
    }]
  };

  const services = resolveServices(config, {});
  assert.equal(services[0].enabled, false);
  assert.equal(services[0].configurationState, "disabled");
  assert.equal(services[0].managementToken, undefined);
});

test("não habilita serviço explicitamente desabilitado mesmo com token disponível", () => {
  const config = {
    services: [{
      id: "supabase-test",
      name: "Teste",
      provider: "supabase",
      enabled: false,
      project_ref: "abc123",
      management_token_env: "WATCHDOG_TEST_TOKEN"
    }]
  };

  const services = resolveServices(config, {
    WATCHDOG_TEST_TOKEN: "secret-value"
  });

  assert.equal(services[0].enabled, false);
  assert.equal(services[0].configurationState, "disabled");
});

test("marca serviço explicitamente habilitado sem credenciais como credentials_pending", () => {
  const config = {
    services: [{
      id: "supabase-test",
      name: "Teste",
      provider: "supabase",
      enabled: true,
      project_ref: "abc123",
      management_token_env: "WATCHDOG_TEST_TOKEN"
    }]
  };

  const services = resolveServices(config, {});
  assert.equal(services[0].enabled, false);
  assert.equal(services[0].configurationState, "credentials_pending");
});

test("habilita Supabase quando está explicitamente habilitado e o token de Management API e project_ref estão disponíveis", () => {
  const config = {
    services: [{
      id: "supabase-test",
      name: "Teste",
      provider: "supabase",
      enabled: true,
      project_ref: "abc123",
      management_token_env: "WATCHDOG_TEST_TOKEN"
    }]
  };

  const services = resolveServices(config, {
    WATCHDOG_TEST_TOKEN: "secret-value"
  });

  assert.equal(services[0].enabled, true);
  assert.equal(services[0].configurationState, "ready");
});

test("gera resumo sem valores de credenciais", () => {
  const config = {
    services: [{
      id: "neo-test",
      name: "Neo",
      provider: "neo4j_aura",
      enabled: true,
      uri_env: "URI",
      username_env: "USER",
      password_env: "PASS",
      client_id_env: "CID",
      client_secret_env: "CSECRET"
    }]
  };

  const services = resolveServices(config, {
    URI: "neo4j+s://example",
    USER: "neo4j",
    PASS: "secret",
    CID: "client-id",
    CSECRET: "client-secret"
  });

  const summary = configurationSummary(services);
  assert.deepEqual(summary[0], {
    serviceId: "neo-test",
    name: "Neo",
    provider: "neo4j_aura",
    enabled: true,
    configurationState: "ready"
  });
});
