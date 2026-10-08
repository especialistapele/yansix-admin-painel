import test from "node:test";
import assert from "node:assert/strict";
import { createNeo4jAuraAdapter } from "../src/neo4j-aura.mjs";
import { STATES } from "../src/engine.mjs";

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

const service = {
  id: "neo4j-kalatrace",
  provider: "neo4j_aura",
  enabled: true,
  uri: "neo4j+s://c74047b0.databases.neo4j.io",
  instanceId: "c74047b0",
  clientId: "client-id",
  clientSecret: "client-secret"
};

test("Aura classifica RUNNING como healthy e usa token OAuth", async () => {
  const calls = [];
  const adapter = createNeo4jAuraAdapter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/oauth/token")) return response(200, { access_token: "bearer-token" });
      return response(200, { id: "c74047b0", status: "running" });
    }
  });
  const result = await adapter(service);
  assert.equal(result.state, STATES.HEALTHY);
  assert.equal(result.providerState, "RUNNING");
  assert.equal(calls[0].url, "https://api.neo4j.io/oauth/token");
  assert.equal(calls[1].url, "https://api.neo4j.io/v1/instances/c74047b0");
  assert.equal(calls[1].options.headers.Authorization, "Bearer bearer-token");
});

test("Aura classifica PAUSED como paused", async () => {
  const adapter = createNeo4jAuraAdapter({
    fetchImpl: async (url) => url.endsWith("/oauth/token") ? response(200, { access_token: "token" }) : response(200, { status: "paused" })
  });
  const result = await adapter(service);
  assert.equal(result.state, STATES.PAUSED);
});
