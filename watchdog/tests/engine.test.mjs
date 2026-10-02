import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHttp,
  checkHttpService,
  createExecutionContext,
  runChecks,
  STATES
} from "../src/engine.mjs";
import { buildEvents, summarize } from "../src/report.mjs";

test("classifica HTTP 2xx como healthy", () => {
  assert.equal(classifyHttp(200), STATES.HEALTHY);
});

test("classifica HTTP 401 como erro de autenticação", () => {
  assert.equal(classifyHttp(401), STATES.AUTHENTICATION_ERROR);
});

test("classifica HTTP 540 como paused", () => {
  assert.equal(classifyHttp(540), STATES.PAUSED);
});

test("classifica HTTP 500 como unavailable", () => {
  assert.equal(classifyHttp(500), STATES.UNAVAILABLE);
});

test("detecta URL ausente sem chamar rede", async () => {
  let called = false;
  const result = await checkHttpService({ timeoutMs: 100 }, async () => {
    called = true;
  });
  assert.equal(result.state, STATES.CONFIGURATION_ERROR);
  assert.equal(called, false);
});

test("normaliza execução com ID e timestamp", async () => {
  const execution = createExecutionContext();
  const run = await runChecks(
    [{
      id: "svc-test",
      name: "Teste",
      provider: "supabase",
      enabled: true,
      url: "https://example.invalid"
    }],
    {
      supabase: async () => ({ state: STATES.HEALTHY, status: 200, latencyMs: 12 })
    },
    execution
  );

  assert.equal(run.execution.executionId, execution.executionId);
  assert.equal(run.results[0].serviceId, "svc-test");
  assert.equal(run.results[0].state, STATES.HEALTHY);
});

test("gera evento de alerta para estado não saudável", () => {
  const summary = summarize({
    execution: { executionId: "exec-1", startedAt: "2026-10-02T17:00:00.000Z" },
    results: [{
      executionId: "exec-1",
      serviceId: "svc-1",
      name: "Serviço",
      provider: "supabase",
      state: STATES.PAUSED,
      status: 540,
      latencyMs: 10,
      reason: null,
      error: null,
      checkedAt: "2026-10-02T17:00:01.000Z"
    }]
  });

  const events = buildEvents(summary);
  assert.equal(events[0].type, "alert_candidate");
  assert.equal(events[0].severity, "warning");
  assert.equal(events[0].state, STATES.PAUSED);
});
