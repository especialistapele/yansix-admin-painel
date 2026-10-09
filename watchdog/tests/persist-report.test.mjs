import test from "node:test";
import assert from "node:assert/strict";
import { persistReport } from "../src/persist-report.mjs";

const report = {
  summary: {
    executionId: "run-test-001",
    startedAt: "2026-10-09T06:00:00.000Z",
    generatedAt: "2026-10-09T06:01:00.000Z",
    total: 2,
    counts: { healthy: 1, unavailable: 1 },
    results: [{ serviceId: "cashback", state: "healthy" }]
  },
  configuration: [{ id: "cashback", configurationState: "configured" }],
  events: [{ serviceId: "cashback", state: "healthy" }]
};

test("persiste o relatório e solicita limpeza de dados com mais de 60 dias", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204 };
  };
  const result = await persistReport({
    report,
    baseUrl: "https://panel.example.supabase.co/",
    serviceRoleKey: "test-secret",
    fetchImpl,
    now: new Date("2026-10-09T12:00:00.000Z")
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].url, /watchdog_runs\?on_conflict=execution_id$/);
  const saved = JSON.parse(calls[0].options.body);
  assert.equal(saved.execution_id, "run-test-001");
  assert.equal(saved.total, 2);
  assert.equal(calls[1].options.method, "DELETE");
  assert.match(calls[1].url, /created_at=lt\./);
  assert.equal(result.executionId, "run-test-001");
});

test("não aceita relatório sem identificador de execução", async () => {
  await assert.rejects(
    persistReport({ report: { summary: {} }, baseUrl: "https://x", serviceRoleKey: "secret" }),
    /executionId/
  );
});

test("informa falha de gravação sem revelar credenciais", async () => {
  await assert.rejects(
    persistReport({
      report,
      baseUrl: "https://panel.example.supabase.co",
      serviceRoleKey: "super-secret",
      fetchImpl: async () => ({ ok: false, status: 401 })
    }),
    /HTTP 401/
  );
});

test("envia a nova chave sb_secret apenas no header apikey, sem Bearer", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204 };
  };
  await persistReport({
    report,
    baseUrl: "https://panel.example.supabase.co",
    serviceRoleKey: "sb_secret_example",
    fetchImpl,
    now: new Date("2026-10-09T12:00:00.000Z")
  });
  assert.equal(calls[0].options.headers.apikey, "sb_secret_example");
  assert.equal("Authorization" in calls[0].options.headers, false);
});
