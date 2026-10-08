import test from "node:test";
import assert from "node:assert/strict";
import { canRecover, recoveryPolicySummary } from "../src/recovery-policy.mjs";
import { createSupabaseRecoveryAdapter, RECOVERY_STATES } from "../src/recovery-supabase.mjs";
import { STATES } from "../src/engine.mjs";

const baseService = {
  id: "supabase-banco-cashback",
  name: "Banco Cashback",
  provider: "supabase",
  enabled: true,
  projectRef: "uaqbnwwjqhhnqzsavbkh",
  managementToken: "secret-token",
  recovery: {
    enabled: true,
    maxAttempts: 1,
    timeoutMs: 15000,
    verifyDelayMs: 10000,
    allowProjectRefs: ["uaqbnwwjqhhnqzsavbkh"]
  }
};

test("não recupera se recovery estiver desabilitado", () => {
  const result = canRecover(
    { ...baseService, recovery: { ...baseService.recovery, enabled: false } },
    { state: STATES.PAUSED }
  );
  assert.deepEqual(result, { allowed: false, reason: "recovery_disabled" });
});

test("não recupera serviço saudável", () => {
  const result = canRecover(baseService, { state: STATES.HEALTHY });
  assert.deepEqual(result, { allowed: false, reason: "state_not_recoverable" });
});

test("não recupera serviço que não seja Supabase", () => {
  const result = canRecover(
    { ...baseService, provider: "neo4j_aura" },
    { state: STATES.PAUSED }
  );
  assert.deepEqual(result, { allowed: false, reason: "provider_not_supported" });
});

test("não recupera sem token", () => {
  const result = canRecover(
    { ...baseService, managementToken: undefined },
    { state: STATES.PAUSED }
  );
  assert.deepEqual(result, { allowed: false, reason: "management_credentials_missing" });
});

test("não recupera sem project ref", () => {
  const result = canRecover(
    { ...baseService, projectRef: undefined },
    { state: STATES.PAUSED }
  );
  assert.deepEqual(result, { allowed: false, reason: "management_credentials_missing" });
});

test("não recupera projeto fora da allowlist", () => {
  const result = canRecover(
    { ...baseService, projectRef: "evqbhkrjguramcphdjtk" },
    { state: STATES.PAUSED }
  );
  assert.deepEqual(result, { allowed: false, reason: "project_not_allowlisted" });
});

test("autoriza Cashback pausado com configuração correta", () => {
  const result = canRecover(baseService, { state: STATES.PAUSED });
  assert.deepEqual(result, {
    allowed: true,
    reason: "paused_project_restore_authorized"
  });
});

test("resume a política sem expor credenciais", () => {
  const summary = recoveryPolicySummary(baseService);
  assert.deepEqual(summary, {
    serviceId: "supabase-banco-cashback",
    enabled: true,
    maxAttempts: 1,
    timeoutMs: 15000,
    verifyDelayMs: 10000,
    allowProjectRefs: ["uaqbnwwjqhhnqzsavbkh"]
  });
  assert.equal("managementToken" in summary, false);
});

test("envia POST para /restore e Authorization Bearer sem expor token", async () => {
  let requestedUrl = null;
  let requestedOptions = null;
  const adapter = createSupabaseRecoveryAdapter({
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;

      if (url.endsWith("/restore")) {
        return {
          status: 202,
          ok: true,
          text: async () => ""
        };
      }

      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ status: "ACTIVE_HEALTHY" })
      };
    }
  });

  const result = await adapter({
    ...baseService,
    recovery: { ...baseService.recovery, verifyDelayMs: 0 }
  });

  assert.equal(result.state, STATES.HEALTHY);
  assert.equal(requestedUrl, "https://api.supabase.com/v1/projects/uaqbnwwjqhhnqzsavbkh/restore");
  assert.equal(requestedOptions.method, "POST");
  assert.equal(requestedOptions.headers.Authorization, "Bearer secret-token");
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("verifica o estado do projeto após o restore", async () => {
  let calls = 0;
  const adapter = createSupabaseRecoveryAdapter({
    fetchImpl: async (url) => {
      calls += 1;
      if (url.endsWith("/restore")) return { status: 202, ok: true, text: async () => "" };
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ status: "ACTIVE_HEALTHY" })
      };
    }
  });

  const result = await adapter({
    ...baseService,
    recovery: { ...baseService.recovery, verifyDelayMs: 0 }
  });

  assert.equal(result.state, STATES.HEALTHY);
  assert.equal(result.verificationAttempt, 1);
  assert.equal(calls, 2);
});

test("403 vira erro de autenticação/permissão", async () => {
  const adapter = createSupabaseRecoveryAdapter({
    fetchImpl: async () => ({ status: 403, ok: false })
  });
  const result = await adapter(baseService);
  assert.equal(result.state, STATES.AUTHENTICATION_ERROR);
});

test("429 é tratado como rate limited", async () => {
  const adapter = createSupabaseRecoveryAdapter({
    fetchImpl: async () => ({ status: 429, ok: false })
  });
  const result = await adapter(baseService);
  assert.equal(result.state, RECOVERY_STATES.RATE_LIMITED);
});

test("erro 5xx é tratado como unavailable", async () => {
  const adapter = createSupabaseRecoveryAdapter({
    fetchImpl: async () => ({ status: 503, ok: false })
  });
  const result = await adapter(baseService);
  assert.equal(result.state, STATES.UNAVAILABLE);
});

test("timeout é tratado sem expor token", async () => {
  const error = new Error("timed out");
  error.name = "TimeoutError";
  const adapter = createSupabaseRecoveryAdapter({
    fetchImpl: async () => { throw error; }
  });
  const result = await adapter(baseService);
  assert.equal(result.state, STATES.TIMEOUT);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});
