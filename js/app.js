/**
 * YANSIX — Painel Central de CRMs
 * app.js — estado, navegação e telas.
 */

const STATE = {
  clientes: [],
  crms: [],
  ultimaMetricaPorCrm: {},
  alertasAbertos: [],
  lastActivity: Date.now(),
};

// =========================================================
// TOASTS
// =========================================================
function toast(msg, type = "") {
  const region = document.getElementById("toast-region");
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = msg;
  region.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// =========================================================
// LOGIN / SESSÃO
// =========================================================
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

function showApp() {
  loginScreen.style.display = "none";
  appShell.classList.add("active");
  loadAll();
}
function showLogin(message) {
  appShell.classList.remove("active");
  loginScreen.style.display = "flex";
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";
  try {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    await API.login(email, password);
    showApp();
  } catch (err) {
    loginError.textContent = err.message || "Não foi possível entrar.";
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await API.logout();
  showLogin();
});

// expira sessão por inatividade
["click", "keydown", "mousemove", "scroll"].forEach((ev) =>
  document.addEventListener(ev, () => (STATE.lastActivity = Date.now()), { passive: true })
);
setInterval(async () => {
  if (!appShell.classList.contains("active")) return;
  const idle = Date.now() - STATE.lastActivity;
  if (idle > CONFIG.SESSION_TIMEOUT_MS) {
    await API.logout();
    showLogin("Sessão expirada por inatividade. Entre novamente.");
  }
}, 30000);

(async function boot() {
  const session = await API.restoreSession();
  if (session) showApp();
  else showLogin();
})();

// =========================================================
// NAVEGAÇÃO
// =========================================================
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    link.classList.add("active");
    document.getElementById(`view-${link.dataset.view}`).classList.add("active");
  });
});

// =========================================================
// CARREGAMENTO GERAL
// =========================================================
async function loadAll() {
  try {
    const [clientes, crms, ultimaMetrica, alertas] = await Promise.all([
      API.getClientes(),
      API.getCrms(),
      API.getUltimaMetricaPorCrm(),
      API.getAlertas({ apenasAbertos: true }),
    ]);
    STATE.clientes = clientes;
    STATE.crms = crms;
    STATE.ultimaMetricaPorCrm = ultimaMetrica;
    STATE.alertasAbertos = alertas;

    renderDashboard();
    renderClientes();
    renderCrms();
    renderMonitoramento();
    preencherSelectClientes();
  } catch (err) {
    toast(err.message || "Erro ao carregar dados.", "error");
  }
}

// =========================================================
// CÁLCULO DE NÍVEL DE ALERTA (storage)
// =========================================================
function nivelStorage(pct) {
  const t = CONFIG.ALERT_THRESHOLDS;
  if (pct >= t.acaoNecessaria) return "acao_necessaria";
  if (pct >= t.critico) return "critico";
  if (pct >= t.atencao) return "atencao";
  return "ok";
}
function pctStorage(metrica) {
  if (!metrica || !metrica.storage_limite_mb) return 0;
  return Math.min(100, Math.round((metrica.storage_usado_mb / metrica.storage_limite_mb) * 100));
}
function corNivel(nivel) {
  return { ok: "var(--green)", atencao: "var(--amber)", critico: "var(--orange)", acao_necessaria: "var(--red)" }[nivel];
}
function labelNivel(nivel) {
  return { ok: "Normal", atencao: "Atenção", critico: "Crítico", acao_necessaria: "Ação necessária" }[nivel];
}
function labelStatus(status) {
  return { ativo: "Ativo", inativo: "Inativo", em_implantacao: "Em implantação", suspenso: "Suspenso" }[status] || status;
}
function fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDataHora(iso) {
  if (!iso) return "nunca verificado";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function nomeCliente(clienteId) {
  return STATE.clientes.find((c) => c.id === clienteId)?.nome || "—";
}

// =========================================================
// DASHBOARD
// =========================================================
function renderDashboard() {
  const total = STATE.crms.length;
  const metricas = Object.values(STATE.ultimaMetricaPorCrm);
  const totalUsuarios = metricas.reduce(
    (soma, m) => soma + (m.total_administradores || 0) + (m.total_gestores || 0) + (m.total_vendedores || 0),
    0
  );
  const storageMedia = metricas.length
    ? Math.round(metricas.reduce((soma, m) => soma + pctStorage(m), 0) / metricas.length)
    : 0;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-ativos").textContent = totalUsuarios;
  document.getElementById("stat-implantacao").textContent = `${storageMedia}%`;
  document.getElementById("stat-alertas").textContent = STATE.alertasAbertos.length;

  const listEl = document.getElementById("dashboard-crm-list");
  if (!STATE.crms.length) {
    listEl.innerHTML = `<div class="empty">Nenhum CRM cadastrado ainda.</div>`;
  } else {
    listEl.innerHTML = STATE.crms
      .map((crm) => {
        const metrica = STATE.ultimaMetricaPorCrm[crm.id];
        const pct = pctStorage(metrica);
        const nivel = metrica ? nivelStorage(pct) : "ok";
        return `
        <div class="crm-row">
          <span class="status-dot ${nivel} ${nivel !== "ok" ? "pulse" : ""}"></span>
          <div>
            <div class="name">${nomeCliente(crm.cliente_id)}</div>
            <div class="meta">${crm.slug} · ${fmtDataHora(crm.ultima_verificacao)}</div>
          </div>
          <div class="spacer"></div>
          <div class="storage-bar"><div class="fill" style="width:${pct}%;background:${corNivel(nivel)}"></div></div>
          <div class="storage-pct">${pct}%</div>
        </div>`;
      })
      .join("");
  }

  const alertasEl = document.getElementById("dashboard-alertas-list");
  if (!STATE.alertasAbertos.length) {
    alertasEl.innerHTML = `<div class="empty">Nenhum alerta em aberto.</div>`;
  } else {
    alertasEl.innerHTML = STATE.alertasAbertos
      .map((a) => {
        const crm = STATE.crms.find((c) => c.id === a.crm_id);
        return `
        <div class="crm-row">
          <span class="status-dot ${a.nivel}"></span>
          <div>
            <div class="name">${crm ? nomeCliente(crm.cliente_id) : "CRM removido"}</div>
            <div class="meta">${a.mensagem || labelNivel(a.nivel)}</div>
          </div>
          <div class="spacer"></div>
          <button class="btn small" data-resolver="${a.id}">Marcar como resolvido</button>
        </div>`;
      })
      .join("");
    alertasEl.querySelectorAll("[data-resolver]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await API.resolverAlerta(btn.dataset.resolver);
          toast("Alerta resolvido.", "success");
          loadAll();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
  }
}

// =========================================================
// CLIENTES
// =========================================================
const clienteModal = document.getElementById("cliente-modal");
document.getElementById("btn-novo-cliente").addEventListener("click", () => {
  document.getElementById("cliente-form").reset();
  clienteModal.showModal();
});
document.getElementById("cliente-cancelar").addEventListener("click", () => clienteModal.close());

document.getElementById("cliente-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    nome: document.getElementById("cliente-nome").value.trim(),
    responsavel: document.getElementById("cliente-responsavel").value.trim(),
    email: document.getElementById("cliente-email").value.trim(),
    status: "em_implantacao",
  };
  try {
    await API.createCliente(payload);
    toast("Cliente criado.", "success");
    clienteModal.close();
    loadAll();
  } catch (err) {
    toast(err.message, "error");
  }
});

function renderClientes() {
  const tbody = document.getElementById("clientes-tbody");
  const emptyEl = document.getElementById("clientes-empty");
  if (!STATE.clientes.length) {
    tbody.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  tbody.innerHTML = STATE.clientes
    .map(
      (c) => `
    <tr>
      <td>${c.nome}</td>
      <td>${c.responsavel || "—"}</td>
      <td>${c.email || "—"}</td>
      <td><span class="badge ${c.status}">${labelStatus(c.status)}</span></td>
      <td>${fmtData(c.criado_em)}</td>
      <td style="text-align:right"><button class="btn small danger" data-del-cliente="${c.id}">Remover</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-del-cliente]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover este cliente? Isso também remove os CRMs associados a ele.")) return;
      try {
        await API.removeCliente(btn.dataset.delCliente);
        toast("Cliente removido.", "success");
        loadAll();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

function preencherSelectClientes() {
  const select = document.getElementById("crm-cliente");
  select.innerHTML = STATE.clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("");
}

// =========================================================
// CRMS
// =========================================================
const crmModal = document.getElementById("crm-modal");

document.getElementById("btn-novo-crm").addEventListener("click", () => {
  if (!STATE.clientes.length) {
    toast("Cadastre um cliente antes de cadastrar um CRM.", "error");
    return;
  }
  document.getElementById("crm-form").reset();
  preencherSelectClientes();
  crmModal.showModal();
});
document.getElementById("crm-fechar").addEventListener("click", () => crmModal.close());

document.getElementById("crm-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const clienteId = document.getElementById("crm-cliente").value;
  const slug = document.getElementById("crm-slug").value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const urlPublica = document.getElementById("crm-url").value.trim();
  const supabaseUrl = document.getElementById("crm-supabase-url").value.trim();
  const supabaseKey = document.getElementById("crm-supabase-key").value.trim();

  try {
    await API.createCrm({
      cliente_id: clienteId,
      slug,
      url_publica: urlPublica,
      supabase_url: supabaseUrl,
      supabase_anon_key: supabaseKey,
      status: "ativo",
    });
    toast("CRM cadastrado para monitoramento.", "success");
    crmModal.close();
    loadAll();
  } catch (err) {
    toast(err.message, "error");
  }
});

function renderCrms() {
  const tbody = document.getElementById("crms-tbody");
  const emptyEl = document.getElementById("crms-empty");
  if (!STATE.crms.length) {
    tbody.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  tbody.innerHTML = STATE.crms
    .map((crm) => {
      const metrica = STATE.ultimaMetricaPorCrm[crm.id];
      const pct = pctStorage(metrica);
      const nivel = metrica ? nivelStorage(pct) : "ok";
      return `
    <tr>
      <td>${nomeCliente(crm.cliente_id)}</td>
      <td class="mono">${crm.slug}</td>
      <td><span class="badge ${crm.status}">${labelStatus(crm.status)}</span></td>
      <td><span class="status-dot ${nivel}"></span> <span class="mono" style="font-size:12px">${pct}%</span></td>
      <td>${fmtDataHora(crm.ultima_verificacao)}</td>
      <td style="text-align:right;white-space:nowrap">
        ${crm.url_publica ? `<a class="btn small" href="${crm.url_publica}" target="_blank" rel="noopener">Abrir</a>` : ""}
      </td>
    </tr>`;
    })
    .join("");
}

// =========================================================
// MONITORAMENTO
// =========================================================
const metricaModal = document.getElementById("metrica-modal");
document.getElementById("metrica-cancelar").addEventListener("click", () => metricaModal.close());

document.getElementById("metrica-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const crmId = document.getElementById("metrica-crm-id").value;
  const payload = {
    crm_id: crmId,
    storage_usado_mb: parseFloat(document.getElementById("metrica-storage-usado").value) || 0,
    storage_limite_mb: parseFloat(document.getElementById("metrica-storage-limite").value) || 500,
    total_clientes: parseInt(document.getElementById("metrica-total-clientes").value) || 0,
    total_administradores: parseInt(document.getElementById("metrica-admins").value) || 0,
    total_gestores: parseInt(document.getElementById("metrica-gestores").value) || 0,
    total_vendedores: parseInt(document.getElementById("metrica-vendedores").value) || 0,
    status_conexao: "ok",
    verificado_em: new Date().toISOString(),
  };
  try {
    await API.registrarMetrica(payload);

    const pct = pctStorage(payload);
    const nivel = nivelStorage(pct);
    if (nivel !== "ok") {
      await API.criarAlerta({
        crm_id: crmId,
        tipo: "storage",
        nivel,
        mensagem: `Storage em ${pct}% — ${labelNivel(nivel)}.`,
      });
    }

    toast("Verificação registrada.", "success");
    metricaModal.close();
    loadAll();
  } catch (err) {
    toast(err.message, "error");
  }
});

// =========================================================
// VERIFICAÇÃO AUTOMÁTICA (consulta o Supabase de cada cliente
// usando só a anon key já cadastrada — sem login, sem
// service_role. Depende da função obter_status_operacional()
// existir naquele CRM — ver sql/status_operacional.sql).
// =========================================================
async function verificarCrmAgora(crm, btn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Verificando...";
  try {
    const clienteTemp = window.supabase.createClient(crm.supabase_url, crm.supabase_anon_key);
    const { data, error } = await clienteTemp.rpc("obter_status_operacional");
    if (error) throw error;
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) throw new Error("Resposta vazia.");

    const payload = {
      crm_id: crm.id,
      storage_usado_mb: Number(linha.tamanho_mb || 0),
      storage_limite_mb: 500,
      total_clientes: Number(linha.total_clientes || 0),
      total_administradores: Number(linha.total_administradores || 0),
      total_gestores: Number(linha.total_gestores || 0),
      total_vendedores: Number(linha.total_vendedores || 0),
      status_conexao: "ok",
      verificado_em: new Date().toISOString(),
    };
    await API.registrarMetrica(payload);

    const pct = pctStorage(payload);
    const nivel = nivelStorage(pct);
    if (nivel !== "ok") {
      await API.criarAlerta({
        crm_id: crm.id,
        tipo: "storage",
        nivel,
        mensagem: `Storage em ${pct}% — ${labelNivel(nivel)}.`,
      });
    }

    toast("Verificação automática concluída.", "success");
    loadAll();
  } catch (err) {
    toast(
      `Não consegui verificar automaticamente (${err.message || "erro"}). Rode sql/status_operacional.sql nesse CRM, ou registre manualmente.`,
      "error"
    );
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function renderMonitoramento() {
  const listEl = document.getElementById("monitoramento-list");
  if (!STATE.crms.length) {
    listEl.innerHTML = `<div class="empty">Nenhum CRM cadastrado ainda.</div>`;
    return;
  }
  listEl.innerHTML = STATE.crms
    .map((crm) => {
      const metrica = STATE.ultimaMetricaPorCrm[crm.id];
      const pct = pctStorage(metrica);
      const nivel = metrica ? nivelStorage(pct) : "ok";
      return `
      <div class="crm-row">
        <span class="status-dot ${nivel} ${nivel !== "ok" ? "pulse" : ""}"></span>
        <div>
          <div class="name">${nomeCliente(crm.cliente_id)}</div>
          <div class="meta">
            ${metrica ? `${metrica.storage_usado_mb} MB / ${metrica.storage_limite_mb} MB · ${labelNivel(nivel)} · ♔ ${metrica.total_administradores ?? "—"} ♗ ${metrica.total_gestores ?? "—"} ♙ ${metrica.total_vendedores ?? "—"}` : "Sem verificação registrada"}
            · última verificação: ${fmtDataHora(crm.ultima_verificacao)}
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn small primary" data-verificar="${crm.id}">Verificar agora</button>
        <button class="btn small" data-registrar="${crm.id}">Inserir manualmente</button>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-verificar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const crm = STATE.crms.find((c) => c.id === btn.dataset.verificar);
      if (crm) verificarCrmAgora(crm, btn);
    });
  });

  listEl.querySelectorAll("[data-registrar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("metrica-form").reset();
      document.getElementById("metrica-crm-id").value = btn.dataset.registrar;
      document.getElementById("metrica-storage-limite").value = 500;
      metricaModal.showModal();
    });
  });
}
