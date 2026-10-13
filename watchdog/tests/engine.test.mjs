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
  assert.equal(events[0].type, "database_sleeping");
  assert.equal(events[0].severity, "warning");
  assert.equal(events[0].state, STATES.PAUSED);
});

test("registra sono, tentativa e recuperação confirmada em eventos separados", () => {
  const summary = {
    executionId: "exec-recovery",
    generatedAt: "2026-10-13T10:02:00.000Z",
    results: [{
      executionId: "exec-recovery", serviceId: "neo4j-kalatrace", name: "KALATRACE Neo4j Aura",
      state: "recovered", detectedState: STATES.PAUSED,
      checkedAt: "2026-10-13T10:00:00.000Z", sleepDetectedAt: "2026-10-13T10:00:00.000Z",
      recoveryAttemptedAt: "2026-10-13T10:00:02.000Z", recoveryCompletedAt: "2026-10-13T10:01:00.000Z",
      recovery: { attempted: true, state: STATES.HEALTHY, reason: "aura_instance_resumed_and_running" }
    }]
  };
  const events = buildEvents(summary);
  assert.deepEqual(events.map((event) => event.type), ["database_sleeping", "wake_attempt", "database_awakened"]);
  assert.equal(events[0].occurredAt, "2026-10-13T10:00:00.000Z");
  assert.equal(events[2].occurredAt, "2026-10-13T10:01:00.000Z");
});

test("não registra banco acordado quando a recuperação falha", () => {
  const summary = {
    executionId: "exec-failed", generatedAt: "2026-10-13T10:02:00.000Z",
    results: [{
      executionId: "exec-failed", serviceId: "neo4j-kalatrace", name: "KALATRACE Neo4j Aura",
      state: "recovery_failed", detectedState: STATES.PAUSED,
      checkedAt: "2026-10-13T10:00:00.000Z", recoveryAttemptedAt: "2026-10-13T10:00:02.000Z",
      recoveryCompletedAt: "2026-10-13T10:01:00.000Z",
      recovery: { attempted: true, state: STATES.RECOVERY_FAILED, reason: "not_running" }
    }]
  };
  const events = buildEvents(summary);
  assert.deepEqual(events.map((event) => event.type), ["database_sleeping", "wake_attempt", "wake_failed"]);
  assert.equal(events.some((event) => event.type === "database_awakened"), false);
});
