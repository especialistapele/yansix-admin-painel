import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseRecoveryAdapter } from "../src/recovery-supabase.mjs";

const service = {
  id: "supabase-enem",
  name: "Sistema ENEM",
  provider: "supabase",
  projectRef: "evqbhkrjguramcphdjtk",
  managementToken: "test-token",
  recovery: { enabled: true, maxAttempts: 2, timeoutMs: 1000, verifyDelayMs: 0 }
};

function response(status, body = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return body === null ? "" : JSON.stringify(body); }
  };
}

test("Supabase recovery confirms healthy only after provider reports ACTIVE_HEALTHY", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (options.method === "POST") return response(202, {});
    return response(200, [{ ref: service.projectRef, status: "ACTIVE_HEALTHY" }]);
  };

  const recover = createSupabaseRecoveryAdapter({ fetchImpl, sleepImpl: async () => {} });
  const result = await recover(service);

  assert.equal(result.state, "healthy");
  assert.equal(result.reason, "project_restored_and_healthy");
  assert.equal(result.providerState, "ACTIVE_HEALTHY");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
});

test("Supabase recovery does not claim success while provider reports COMING_UP", async () => {
  const fetchImpl = async (_url, options) => {
    if (options.method === "POST") return response(202, {});
    return response(200, [{ ref: service.projectRef, status: "COMING_UP" }]);
  };

  const recover = createSupabaseRecoveryAdapter({ fetchImpl, sleepImpl: async () => {} });
  const result = await recover(service);

  assert.equal(result.state, "recovery_failed");
  assert.equal(result.reason, "restore_requested_but_project_not_healthy");
  assert.equal(result.verification.providerState, "COMING_UP");
  assert.equal(result.verification.attempt, 2);
});

test("Supabase recovery refuses to call provider without management credentials", async () => {
  let called = false;
  const recover = createSupabaseRecoveryAdapter({
    fetchImpl: async () => { called = true; return response(200, []); },
    sleepImpl: async () => {}
  });

  const result = await recover({ ...service, managementToken: "" });

  assert.equal(result.state, "configuration_error");
  assert.equal(result.reason, "management_credentials_missing");
  assert.equal(called, false);
});
