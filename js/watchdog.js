(() => {
  const root = document.getElementById("view-watchdog");
  if (!root) return;
  const panel = document.getElementById("watchdog-runs-list");
  const details = document.getElementById("watchdog-latest-details");
  const refresh = document.getElementById("watchdog-refresh");
  const runNow = document.getElementById("watchdog-run-now");
  const dispatchStatus = document.getElementById("watchdog-dispatch-status");
  let loading = false;
  let dispatching = false;

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
      <p class="meta watchdog-footnote">A recuperação automática permanece desativada. O acionamento manual inicia apenas as verificações; não desperta, reinicia nem altera os serviços monitorados.</p>`;
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
      panel.innerHTML = runs.map((run, index) => {
        const runStates = run.counts || {};
        const runUnhealthy = Number(runStates.unavailable || 0) + Number(runStates.timeout || 0)
          + Number(runStates.authentication_error || 0) + Number(runStates.recovery_failed || 0);
        return `
          <button class="watchdog-run-row ${index === 0 ? "selected" : ""}" type="button" data-run-index="${index}">
            <span class="watchdog-run-indicator ${runUnhealthy ? "bad" : "ok"}"></span>
            <span class="watchdog-run-title"><strong>${esc(date(run.generated_at))}</strong><small>ID: ${esc(run.execution_id)}</small></span>
            <span class="watchdog-run-total">${Number(run.total) || 0} serviços</span>
            <span class="watchdog-run-summary">${runUnhealthy ? `${runUnhealthy} com falha/timeout` : "Sem falhas reportadas"}</span>
          </button>`;
      }).join("");
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
  function showDispatchStatus(message, kind = "") {
    if (!dispatchStatus) return;
    dispatchStatus.textContent = message;
    dispatchStatus.className = `watchdog-dispatch-status ${kind}`.trim();
    dispatchStatus.hidden = false;
  }

  if (runNow) {
    runNow.addEventListener("click", async () => {
      if (dispatching) return;
      const accepted = window.confirm(
        "Iniciar agora uma nova rodada de verificações do Watchdog?\n\nIsso executa somente os testes de saúde. Nenhum serviço será despertado, reiniciado ou alterado."
      );
      if (!accepted) return;

      dispatching = true;
      runNow.disabled = true;
      runNow.textContent = "Solicitando…";
      showDispatchStatus("Enviando solicitação segura ao GitHub Actions…");
      try {
        const { data, error } = await SUPABASE_CLIENT.functions.invoke("watchdog-dispatch", {
          body: { action: "run-checks" }
        });
        if (error) {
          const details = error.context?.body?.error || error.message || "Falha na chamada segura.";
          throw new Error(details);
        }
        if (!data?.accepted) throw new Error(data?.error || "O GitHub não confirmou o acionamento.");
        showDispatchStatus(
          "Solicitação aceita. O GitHub Actions iniciará uma nova execução; ela aparecerá no histórico após concluir e salvar o relatório. A solicitação não confirma que os testes já terminaram.",
          "success"
        );
      } catch (error) {
        console.error("Falha ao acionar Watchdog:", error);
        const message = String(error?.message || "");
        const friendly = /WATCHDOG_GITHUB_TOKEN|not configured|secret/i.test(message)
          ? "O acionamento manual ainda não está configurado: falta cadastrar o segredo WATCHDOG_GITHUB_TOKEN nas Edge Function Secrets do Supabase do painel."
          : /403|not authorized|forbidden/i.test(message)
            ? "A solicitação foi recusada por permissão. Confira se a credencial do GitHub tem permissão Actions: write apenas neste repositório."
            : `Não foi possível iniciar a verificação: ${message || "erro de conexão"}`;
        showDispatchStatus(friendly, "error");
      } finally {
        dispatching = false;
        runNow.disabled = false;
        runNow.textContent = "▶ Verificar agora";
      }
    });
  }

  refresh.addEventListener("click", load);
  document.querySelector('.nav-link[data-view="watchdog"]')?.addEventListener("click", load);
  window.addEventListener("watchdog:refresh", load);
})();
