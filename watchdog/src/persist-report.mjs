import fs from "node:fs/promises";

export async function persistReport({
  report,
  baseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
  now = new Date()
}) {
  if (!report?.summary?.executionId) throw new Error("Relatório inválido: summary.executionId ausente.");
  if (!baseUrl || !serviceRoleKey) throw new Error("Configuração de persistência ausente.");
  const url = baseUrl.replace(/\/+$/, "");
  const summary = report.summary;
  const row = {
    execution_id: String(summary.executionId),
    started_at: summary.startedAt || null,
    generated_at: summary.generatedAt || now.toISOString(),
    total: Number(summary.total || 0),
    counts: summary.counts || {},
    configuration: report.configuration || [],
    events: report.events || [],
    results: summary.results || []
  };
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal"
  };
  const upsert = await fetchImpl(`${url}/rest/v1/watchdog_runs?on_conflict=execution_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row)
  });
  if (!upsert.ok) {
    throw new Error(`Persistência Watchdog falhou (HTTP ${upsert.status}). Verifique o segredo e as permissões do projeto central.`);
  }

  const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const cleanup = await fetchImpl(
    `${url}/rest/v1/watchdog_runs?created_at=lt.${encodeURIComponent(cutoff)}`,
    { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } }
  );
  if (!cleanup.ok) {
    throw new Error(`Relatório gravado, mas a limpeza de retenção falhou (HTTP ${cleanup.status}).`);
  }
  return { executionId: row.execution_id, retainedSince: cutoff };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const reportPath = new URL("../report.json", import.meta.url);
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const result = await persistReport({
    report,
    baseUrl: process.env.WATCHDOG_PANEL_SUPABASE_URL,
    serviceRoleKey: process.env.WATCHDOG_PANEL_SUPABASE_SERVICE_ROLE
  });
  console.log(`Relatório Watchdog persistido: ${result.executionId}; retenção desde ${result.retainedSince}`);
}
