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
  const events = [];
  for (const result of summary.results) {
    const sleepingDetected = result.detectedState === STATES.PAUSED || result.state === STATES.PAUSED;
    if (sleepingDetected) {
      events.push({
        executionId: summary.executionId,
        serviceId: result.serviceId,
        type: "database_sleeping",
        severity: "warning",
        state: STATES.PAUSED,
        message: `Banco dormindo detectado: ${result.name || result.serviceId}.`,
        occurredAt: result.sleepDetectedAt || result.checkedAt
      });
    }

    if (result.recovery?.attempted) {
      events.push({
        executionId: summary.executionId,
        serviceId: result.serviceId,
        type: "wake_attempt",
        severity: "info",
        state: "recovery_requested",
        message: `Tentativa de acordar iniciada para ${result.name || result.serviceId}.`,
        occurredAt: result.recoveryAttemptedAt || result.checkedAt
      });

      if (result.state === "recovered" && result.recovery.state === STATES.HEALTHY) {
        events.push({
          executionId: summary.executionId,
          serviceId: result.serviceId,
          type: "database_awakened",
          severity: "info",
          state: "recovered",
          message: `Banco acordado e estado operacional confirmado: ${result.name || result.serviceId}.`,
          occurredAt: result.recoveryCompletedAt || summary.generatedAt
        });
      } else {
        events.push({
          executionId: summary.executionId,
          serviceId: result.serviceId,
          type: "wake_failed",
          severity: "error",
          state: "recovery_failed",
          message: `Falha ao acordar ${result.name || result.serviceId}: ${result.recovery.reason || "estado operacional não confirmado"}.`,
          occurredAt: result.recoveryCompletedAt || summary.generatedAt
        });
      }
    } else if (!sleepingDetected) {
      events.push({
        executionId: summary.executionId,
        serviceId: result.serviceId,
        type: result.state === STATES.HEALTHY || result.state === STATES.RECOVERED || result.state === STATES.CONFIGURATION_ERROR ? "check" : "alert_candidate",
        severity: result.state === STATES.HEALTHY || result.state === STATES.RECOVERED || result.state === STATES.CONFIGURATION_ERROR ? "info" : "warning",
        state: result.state,
        message: result.reason || result.error || `Estado detectado: ${result.state}`,
        occurredAt: result.checkedAt
      });
    }
  }
  return events.sort((a, b) => String(a.occurredAt || "").localeCompare(String(b.occurredAt || "")));
}

export function toMarkdown(summary, configuration = []) {
  const lines = [
    "# Watchdog — relatório de execução",
    "",
    `Execução: \`${summary.executionId}\``,
    `Iniciada em: ${summary.startedAt}`,
    `Gerada em: ${summary.generatedAt}`,
    `Total de serviços: ${summary.total}`,
    "",
    "## Configuração",
    "",
    "| Serviço | Provedor | Habilitado | Configuração |",
    "|---|---|---:|---|"
  ];

  for (const item of configuration) {
    lines.push(
      `| ${item.name} | ${item.provider} | ${item.enabled ? "sim" : "não"} | ${item.configurationState} |`
    );
  }

  lines.push("", "## Estados", "");

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
