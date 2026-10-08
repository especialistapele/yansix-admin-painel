import test from "node:test";
import assert from "node:assert/strict";
import { createNeo4jAuraRecoveryAdapter } from "../src/recovery-neo4j-aura.mjs";
import { STATES } from "../src/engine.mjs";

const service = {
  id: "neo4j-kalatrace",
  provider: "neo4j_aura",
  enabled: true,
  uri: "neo4j+s://c74047b0.databases.neo4j.io",
  instanceId: "c74047b0",
  clientId: "client-id",
  clientSecret: "client-secret",
  recovery: { enabled: true, maxAttempts: 2, timeoutMs: 15000, verifyDelayMs: 0, allowProjectRefs: ["c74047b0"] }
};

test("Aura recovery envia POST /resume e confirma RUNNING", async () => {
  const calls = [];
  let checks = 0;
  const adapter = createNeo4jAuraRecoveryAdapter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/oauth/token")) return { status: 200, ok: true, json: async () => ({ access_token: "token" }) };
      if (url.endsWith("/resume")) return { status: 202, ok: true, json: async () => ({}) };
      checks += 1;
      return { status: 200, ok: true, json: async () => ({ status: checks > 1 ? "running" : "resuming" }) };
    }
  });
  const result = await adapter(service);
  assert.equal(result.state, STATES.HEALTHY);
  assert.equal(result.verificationAttempt, 2);
  assert.equal(calls[1].url, "https://api.neo4j.io/v1/instances/c74047b0/resume");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(JSON.stringify(result).includes("client-secret"), false);
});

test("Aura recovery trata 403 como autenticação/permissão", async () => {
  const adapter = createNeo4jAuraRecoveryAdapter({
    fetchImpl: async () => ({ status: 403, ok: false, json: async () => ({}) })
  });
  const result = await adapter(service);
  assert.equal(result.state, STATES.AUTHENTICATION_ERROR);
});
