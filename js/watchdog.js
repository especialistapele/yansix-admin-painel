(() => {
  const root = document.getElementById("watchdog-dashboard");
  if (!root) return;
  const panel = document.getElementById("watchdog-runs-list");
  const details = document.getElementById("watchdog-latest-details");
  const refresh = document.getElementById("watchdog-refresh");
  let loading = false;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const date = (value) => value ? new Date(value).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }) : "—";
  const label = (value) => ({
    healthy: "Saudável", recovered: "Recuperado", unavailable: "Indisponível",
    timeout: "Tempo esgotado", authentication_error: "Erro de autenticação",
    configuration_error: "Configuração pendente", unknown: "Desconhecido",
    paused: "Pausado", recovery_failed: "Falha na recuperação"
  }[value] || value || "Sem estado");
  const tone = (value) => ["healthy", "recovered"].includes(value) ? "ok"
    : ["unavailable", "timeout", "authentication_error", "recovery_failed"].includes(value) ? "bad"
    : ["paused", "unknown", "configuration_error"].includes(value) ? "warn" : "neutral";

  function renderDetails(run) {
    const results = Array.isArray(run.results) ? run.results : [];
    const counts = run.counts || {};
    const countCards = Object.entries(counts).map(([key, value]) =>
      `<div class="watchdog-count"><span>${esc(label(key))}</span><strong>${Number(value) || 0}</strong></div>`
    ).join("");
    const rows = results.map((item) => `
      <tr>
        <td><strong>${esc(item.name || item.serviceId)}</strong><small>${esc(item.provider || "")}</small></td>
        <td><span class="watchdog-state ${tone(item.state)}">${esc(label(item.state))}</span></td>
        <td>${item.status == null ? "—" : esc(item.status)}</td>
        <td>${item.latencyMs == null ? "—" : `${esc(item.latencyMs)} ms`}</td>
        <td>${esc(item.reason || item.error || "—")}</td>
      </tr>`).join("");
    details.innerHTML = `
      <div class="watchdog-run-meta"><div><span>Iniciada</span><strong>${esc(date(run.started_at))}</strong></div><div><span>Relatório gerado</span><strong>${esc(date(run.generated_at))}</strong></div><div><span>Serviços verificados</span><strong>${Number(run.total) || 0}</strong></div></div>
      <div class="watchdog-counts">${countCards || '<span class="meta">Sem contagens disponíveis.</span>'}</div>
      <div class="table-responsive"><table class="watchdog-table"><thead><tr><th>Serviço</th><th>Estado</th><th>HTTP</th><th>Latência</th><th>Detalhe</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Esta execução não possui detalhes de serviços.</td></tr>'}</tbody></table></div>
      <p class="meta watchdog-footnote">A recuperação automática permanece desativada. Esta tela apresenta observações, não executa ações sobre os serviços monitorados.</p>`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    refresh.textContent = "Atualizando…";
    panel.innerHTML = '<div class="empty">Consultando histórico do Watchdog…</div>';
    try {
      const { data, error } = await SUPABASE_CLIENT.from("watchdog_runs")
        .select("execution_id,started_at,generated_at,total,counts,configuration,events,results,created_at")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const runs = data || [];
      if (!runs.length) {
        panel.innerHTML = '<div class="empty">Nenhuma execução foi registrada ainda. Depois que o segredo de integração estiver configurado e o workflow executar, o histórico aparecerá aqui.</div>';
        details.innerHTML = '<div class="empty">Ainda não há detalhes para exibir.</div>';
        return;
      }
      const latest = runs[0];
      const states = latest.counts || {};
      const unhealthy = Number(states.unavailable || 0) + Number(states.timeout || 0)
        + Number(states.authentication_error || 0) + Number(states.recovery_failed || 0);
      panel.innerHTML = runs.map((run, index) => `
        <button class="watchdog-run-row ${index === 0 ? "selected" : ""}" type="button" data-run-index="${index}">
          <span class="watchdog-run-indicator ${index === 0 ? (unhealthy ? "bad" : "ok") : "neutral"}"></span>
          <span class="watchdog-run-title"><strong>${esc(date(run.generated_at))}</strong><small>ID: ${esc(run.execution_id)}</small></span>
          <span class="watchdog-run-total">${Number(run.total) || 0} serviços</span>
          <span class="watchdog-run-summary">${unhealthy ? `${unhealthy} com falha/timeout` : "Sem falhas reportadas"}</span>
        </button>`).join("");
      panel.querySelectorAll("[data-run-index]").forEach((button) => button.addEventListener("click", () => {
        panel.querySelectorAll(".watchdog-run-row").forEach((row) => row.classList.remove("selected"));
        button.classList.add("selected");
        renderDetails(runs[Number(button.dataset.runIndex)]);
      }));
      renderDetails(latest);
    } catch (error) {
      console.error("Falha ao carregar histórico Watchdog:", error);
      panel.innerHTML = `<div class="empty watchdog-error">Não foi possível consultar o histórico. Confirme a migration da tabela watchdog_runs e a sessão do operador. <small>${esc(error.message || "Erro de conexão")}</small></div>`;
      details.innerHTML = "";
    } finally {
      loading = false;
      refresh.disabled = false;
      refresh.textContent = "Atualizar histórico";
    }
  }
  refresh.addEventListener("click", load);
  document.querySelector('.nav-link[data-view="watchdog"]')?.addEventListener("click", load);
  window.addEventListener("watchdog:refresh", load);
})();
