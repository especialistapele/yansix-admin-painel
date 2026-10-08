import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseAdapter, projectRefFromUrl } from "../src/supabase.mjs";
import { STATES } from "../src/engine.mjs";

function response(status, body = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

test("extrai project ref da URL Supabase", () => {
  assert.equal(projectRefFromUrl("https://clwaotfbqwvxpykruwed.supabase.co"), "clwaotfbqwvxpykruwed");
});

test("Management API classifica ACTIVE_HEALTHY como healthy", async () => {
  let requestedUrl = null;
  const adapter = createSupabaseAdapter({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return response(200, [{ ref: "project-ref", status: "ACTIVE_HEALTHY" }]);
    }
  });
  const result = await adapter({ id: "supabase-test", provider: "supabase", projectRef: "project-ref", managementToken: "test-token" });
  assert.equal(result.state, STATES.HEALTHY);
  assert.equal(result.providerState, "ACTIVE_HEALTHY");
  assert.equal(requestedUrl, "https://api.supabase.com/v1/projects");
});

test("Management API classifica INACTIVE como paused", async () => {
  const adapter = createSupabaseAdapter({
    fetchImpl: async () => response(200, [{ ref: "project-ref", status: "INACTIVE" }])
  });
  const result = await adapter({ id: "supabase-test", provider: "supabase", projectRef: "project-ref", managementToken: "test-token" });
  assert.equal(result.state, STATES.PAUSED);
  assert.equal(result.providerState, "INACTIVE");
});

test("Management API separa 401 como erro de autenticação", async () => {
  const adapter = createSupabaseAdapter({ fetchImpl: async () => response(401, { message: "unauthorized" }) });
  const result = await adapter({ id: "supabase-test", provider: "supabase", projectRef: "project-ref", managementToken: "test-token" });
  assert.equal(result.state, STATES.AUTHENTICATION_ERROR);
});

test("sem Management token usa fallback HTTP do projeto", async () => {
  const adapter = createSupabaseAdapter({ fetchImpl: async () => response(200) });
  const result = await adapter({ id: "supabase-test", provider: "supabase", url: "https://project-ref.supabase.co", headers: { apikey: "anon-key" } });
  assert.equal(result.state, STATES.HEALTHY);
});

test("Management API identifica projeto ausente", async () => {
  const adapter = createSupabaseAdapter({ fetchImpl: async () => response(200, [{ ref: "outro", status: "ACTIVE_HEALTHY" }]) });
  const result = await adapter({ id: "supabase-test", provider: "supabase", projectRef: "project-ref", managementToken: "test-token" });
  assert.equal(result.state, STATES.UNKNOWN);
  assert.equal(result.reason, "management_api_project_not_found");
});
