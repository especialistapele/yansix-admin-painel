import { STATES } from "./engine.mjs";

export function summarize(run) {
  const counts = {};
  for (const result of run.results) {
    counts[result.state] = (counts[result.state] || 0) + 1;
  }

  return {
    executionId: run.execution.executionId,
    startedAt: run.execution.startedAt,
    generatedAt: new Date().toISOString(),
    total: run.results.length,
    counts,
    results: run.results
  };
}

export function buildEvents(summary) {
  return summary.results.map((result) => ({
    executionId: summary.executionId,
    serviceId: result.serviceId,
    type: result.state === STATES.HEALTHY ? "check" : "alert_candidate",
    severity: result.state === STATES.HEALTHY ? "info" : "warning",
    state: result.state,
    message: result.reason || result.error || `Estado detectado: ${result.state}`,
    occurredAt: result.checkedAt
  }));
}

export function toMarkdown(summary) {
  const lines = [
    "# Watchdog — relatório de execução",
    "",
    `Execução: \`${summary.executionId}\``,
    `Iniciada em: ${summary.startedAt}`,
    `Gerada em: ${summary.generatedAt}`,
    `Total de serviços: ${summary.total}`,
    "",
    "## Estados",
    ""
  ];

  for (const [state, count] of Object.entries(summary.counts)) {
    lines.push(`- **${state}**: ${count}`);
  }

  lines.push(
    "",
    "## Detalhes",
    "",
    "| Serviço | Provedor | Estado | HTTP | Latência | Motivo |",
    "|---|---|---|---:|---:|---|"
  );

  for (const r of summary.results) {
    lines.push(
      `| ${r.name} | ${r.provider} | ${r.state} | ${r.status ?? "-"} | ${r.latencyMs ?? "-"} ms | ${r.reason || r.error || "-"} |`
    );
  }

  return lines.join("\n");
}
