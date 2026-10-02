import test from "node:test";
import assert from "node:assert/strict";
import { classifyHttp, checkHttpService, STATES } from "../src/engine.mjs";

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
