export function summarize(results) {
  const counts = {};
  for (const result of results) {
    counts[result.state] = (counts[result.state] || 0) + 1;
  }

  return {
    total: results.length,
    counts,
    generatedAt: new Date().toISOString(),
    results
  };
}

export function toMarkdown(summary) {
  const lines = [
    "# Watchdog — relatório de execução",
    "",
    `Gerado em: ${summary.generatedAt}`,
    `Total de serviços: ${summary.total}`,
    "",
    "## Estados",
    ""
  ];

  for (const [state, count] of Object.entries(summary.counts)) {
    lines.push(`- **${state}**: ${count}`);
  }

  lines.push("", "## Detalhes", "", "| Serviço | Provedor | Estado | HTTP | Latência |", "|---|---|---|---:|---:|");
  for (const r of summary.results) {
    lines.push(`| ${r.name} | ${r.provider} | ${r.state} | ${r.status ?? "-"} | ${r.latencyMs ?? "-"} ms |`);
  }

  return lines.join("\n");
}
