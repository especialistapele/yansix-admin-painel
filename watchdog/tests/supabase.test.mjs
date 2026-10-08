import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseAdapter, projectRefFromUrl } from "../src/supabase.mjs";
import { STATES } from "../src/engine.mjs";

function response(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body)
  };
}

test("extrai project ref da URL Supabase", () => {
  assert.equal(
    projectRefFromUrl("https://clwaotfbqwvxpykruwed.supabase.co"),
    "clwaotfbqwvxpykruwed"
  );
});

test("Management API classifica ACTIVE_HEALTHY como healthy", async () => {
  let requestedUrl = null;
  const adapter = createSupabaseAdapter({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return response(200, { status: "ACTIVE_HEALTHY" });
    }
  });

  const result = await adapter({
    id: "supabase-test",
    provider: "supabase",
    projectRef: "project-ref",
    managementToken: "test-token"
  });

  assert.equal(result.state, STATES.HEALTHY);
  assert.match(requestedUrl, /api\.supabase\.com\/v1\/projects\/project-ref$/);
});

test("Management API classifica INACTIVE como paused", async () => {
  const adapter = createSupabaseAdapter({
    fetchImpl: async () => response(200, { status: "INACTIVE" })
  });

  const result = await adapter({
    id: "supabase-test",
    provider: "supabase",
    projectRef: "project-ref",
    managementToken: "test-token"
  });

  assert.equal(result.state, STATES.PAUSED);
});

test("Management API separa 401 como erro de autenticação", async () => {
  const adapter = createSupabaseAdapter({
    fetchImpl: async () => response(401, { message: "unauthorized" })
  });

  const result = await adapter({
    id: "supabase-test",
    provider: "supabase",
    projectRef: "project-ref",
    managementToken: "test-token"
  });

  assert.equal(result.state, STATES.AUTHENTICATION_ERROR);
});

test("sem Management token usa fallback HTTP do projeto", async () => {
  const adapter = createSupabaseAdapter({
    fetchImpl: async () => response(200)
  });

  const result = await adapter({
    id: "supabase-test",
    provider: "supabase",
    url: "https://project-ref.supabase.co",
    headers: { apikey: "anon-key" }
  });

  assert.equal(result.state, STATES.HEALTHY);
});
