/**
 * YANSIX — Painel Central de CRMs
 * app.js — estado, navegação e telas.
 */

const STATE = {
  clientes: [],
  crms: [],
  ultimaMetricaPorCrm: {},
  alertasAbertos: [],
  chamados: [],
  chamadoAtualId: null,
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
    const [clientes, crms, ultimaMetrica, alertas, chamados] = await Promise.all([
      API.getClientes(),
      API.getCrms(),
      API.getUltimaMetricaPorCrm(),
      API.getAlertas({ apenasAbertos: true }),
      API.getChamados(),
    ]);
    STATE.clientes = clientes;
    STATE.crms = crms;
    STATE.ultimaMetricaPorCrm = ultimaMetrica;
    STATE.alertasAbertos = alertas;
    STATE.chamados = chamados;

    renderDashboard();
    renderClientes();
    renderCrms();
    renderMonitoramento();
    preencherSelectClientes();
    renderChamados();
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

// =========================================================
// CENTRAL DE CHAMADOS
// =========================================================
const CHAMADO_LABEL_PRODUTO = Object.fromEntries(CONFIG.PRODUTOS.map((p) => [p.id, p.nome]));

function labelChamadoStatus(s) {
  return CONFIG.CHAMADO_STATUS_LABELS[s] || s;
}
function corPrioridade(p) {
  return { baixa: "var(--muted)", normal: "#3867B7", alta: "var(--amber)", critica: "var(--red)" }[p] || "var(--muted)";
}
function chamadoForaDoPrazo(c) {
  if (["resolvido", "encerrado"].includes(c.status)) return false;
  const prazo = c.prazo_solucao || c.prazo_primeira_resposta;
  return prazo && new Date(prazo) < new Date();
}
function fmtDataHoraCurta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// preenche os selects de filtro (produto / status) uma única vez
(function initFiltrosChamados() {
  const selProduto = document.getElementById("ch-filtro-produto");
  const selStatus = document.getElementById("ch-filtro-status");
  if (!selProduto || !selStatus) return;
  CONFIG.PRODUTOS.forEach((p) => selProduto.insertAdjacentHTML("beforeend", `<option value="${p.id}">${p.nome}</option>`));
  CONFIG.CHAMADO_STATUS.forEach((s) =>
    selStatus.insertAdjacentHTML("beforeend", `<option value="${s}">${labelChamadoStatus(s)}</option>`)
  );
  ["ch-filtro-busca", "ch-filtro-produto", "ch-filtro-status", "ch-filtro-prioridade"].forEach((id) =>
    document.getElementById(id).addEventListener("input", renderChamados)
  );
})();

document.getElementById("btn-copiar-link-chamado")?.addEventListener("click", async () => {
  const url = new URL("chamado.html", location.href).toString();
  try {
    await navigator.clipboard.writeText(url);
    toast("Link do formulário copiado.", "success");
  } catch {
    toast(url, "");
  }
});

function chamadosFiltrados() {
  const busca = (document.getElementById("ch-filtro-busca")?.value || "").toLowerCase().trim();
  const produto = document.getElementById("ch-filtro-produto")?.value || "";
  const status = document.getElementById("ch-filtro-status")?.value || "";
  const prioridade = document.getElementById("ch-filtro-prioridade")?.value || "";
  return STATE.chamados.filter((c) => {
    if (produto && c.produto !== produto) return false;
    if (status && c.status !== status) return false;
    if (prioridade && c.prioridade !== prioridade) return false;
    if (busca) {
      const alvo = `${c.numero} ${c.empresa} ${c.assunto} ${c.solicitante}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

function renderChamados() {
  if (!document.getElementById("chamados-tbody")) return;

  // ---- indicadores ----
  const abertos = STATE.chamados.filter((c) => c.status === "aberto").length;
  const atendimento = STATE.chamados.filter((c) => ["em_atendimento", "em_desenvolvimento", "em_analise"].includes(c.status)).length;
  const criticos = STATE.chamados.filter((c) => c.prioridade === "critica" && !["resolvido", "encerrado"].includes(c.status)).length;
  const aguardando = STATE.chamados.filter((c) => c.status === "aguardando_cliente").length;
  const resolvidos = STATE.chamados.filter((c) => ["resolvido", "encerrado"].includes(c.status)).length;
  const atrasados = STATE.chamados.filter(chamadoForaDoPrazo).length;
  document.getElementById("ch-stat-aberto").textContent = abertos;
  document.getElementById("ch-stat-atendimento").textContent = atendimento;
  document.getElementById("ch-stat-critico").textContent = criticos;
  document.getElementById("ch-stat-aguardando").textContent = aguardando;
  document.getElementById("ch-stat-resolvido").textContent = resolvidos;
  document.getElementById("ch-stat-atrasado").textContent = atrasados;

  // ---- por produto ----
  const porProduto = document.getElementById("chamados-por-produto");
  porProduto.innerHTML = CONFIG.PRODUTOS.map((p) => {
    const doProduto = STATE.chamados.filter((c) => c.produto === p.id);
    const abertosProduto = doProduto.filter((c) => !["resolvido", "encerrado"].includes(c.status)).length;
    return `<div class="crm-row"><div class="name">${p.nome}</div><div class="spacer"></div><div class="meta">${abertosProduto} em aberto · ${doProduto.length} no total</div></div>`;
  }).join("");

  // ---- tabela ----
  const lista = chamadosFiltrados();
  const tbody = document.getElementById("chamados-tbody");
  document.getElementById("chamados-empty").hidden = lista.length > 0;
  tbody.innerHTML = lista
    .map((c) => `
      <tr>
        <td class="mono">${c.numero || "—"}</td>
        <td>${c.empresa}</td>
        <td>${CHAMADO_LABEL_PRODUTO[c.produto] || c.produto}</td>
        <td>${c.assunto}</td>
        <td><span style="color:${corPrioridade(c.prioridade)};font-weight:700;text-transform:capitalize">${c.prioridade}${chamadoForaDoPrazo(c) ? " · fora do prazo" : ""}</span></td>
        <td><span class="badge ${c.status === "resolvido" || c.status === "encerrado" ? "ativo" : c.status === "aberto" ? "em_implantacao" : "inativo"}">${labelChamadoStatus(c.status)}</span></td>
        <td>${fmtDataHoraCurta(c.criado_em)}</td>
        <td><button class="btn small" data-ver-chamado="${c.id}">Ver</button></td>
      </tr>`)
    .join("");
  tbody.querySelectorAll("[data-ver-chamado]").forEach((btn) =>
    btn.addEventListener("click", () => abrirChamadoModal(btn.dataset.verChamado))
  );
}

// ---- modal de detalhe ----
const chamadoModal = document.getElementById("chamado-modal");
document.getElementById("chamado-fechar")?.addEventListener("click", () => chamadoModal.close());

function linkWhatsapp(telefone, mensagem) {
  const numero = (telefone || "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

async function abrirChamadoModal(id) {
  const c = STATE.chamados.find((x) => x.id === id);
  if (!c) return;
  STATE.chamadoAtualId = id;
  document.getElementById("chamado-modal-numero").textContent = `${c.numero} · ${c.assunto}`;

  const msgChegou = `Olá, ${c.solicitante}! Recebemos o seu chamado ${c.numero} sobre "${c.assunto}" e já estamos analisando. Vamos te manter atualizado por aqui.`;
  const msgResolvido = `Olá, ${c.solicitante}! Seu chamado ${c.numero} foi resolvido. Qualquer coisa, é só chamar novamente. 🙂`;

  const anexosHtml = (c.anexos || []).length
    ? c.anexos.map((a) => `<div class="crm-row"><div class="name">${a.nome}</div><div class="spacer"></div><button class="btn small" data-baixar-anexo="${a.caminho}">Baixar</button></div>`).join("")
    : `<div class="empty">Nenhum anexo.</div>`;

  document.getElementById("chamado-modal-body").innerHTML = `
    <div class="detail-grid" style="grid-template-columns:1fr 1fr;padding:0 0 8px">
      <div class="detail-card"><h4>Empresa</h4><p>${c.empresa}</p></div>
      <div class="detail-card"><h4>Solicitante</h4><p>${c.solicitante}<br><span class="mono" style="font-size:11px">${c.email} · ${c.telefone}</span></p></div>
      <div class="detail-card"><h4>Produto / categoria</h4><p>${CHAMADO_LABEL_PRODUTO[c.produto] || c.produto} · ${c.categoria}</p></div>
      <div class="detail-card"><h4>Origem</h4><p>${c.origem_sistema}</p></div>
    </div>

    <div class="field"><label>Descrição</label><p style="white-space:pre-wrap;font-size:13px">${c.descricao || "—"}</p></div>
    ${c.mensagem_erro ? `<div class="field"><label>Mensagem de erro</label><p class="mono" style="font-size:12px">${c.mensagem_erro}</p></div>` : ""}
    ${c.passos_reproducao ? `<div class="field"><label>Passos para reproduzir</label><p style="white-space:pre-wrap;font-size:13px">${c.passos_reproducao}</p></div>` : ""}

    <div class="detail-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="field"><label>Status</label>
        <select id="ch-edit-status">
          ${CONFIG.CHAMADO_STATUS.map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${labelChamadoStatus(s)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Prioridade</label>
        <select id="ch-edit-prioridade">
          ${CONFIG.CHAMADO_PRIORIDADES.map((p) => `<option value="${p}" ${p === c.prioridade ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Responsável</label><input type="text" id="ch-edit-responsavel" value="${c.responsavel || ""}"></div>
    </div>

    <div class="detail-grid" style="grid-template-columns:1fr 1fr">
      <div class="detail-card"><h4>Prazo 1ª resposta</h4><p>${fmtDataHoraCurta(c.prazo_primeira_resposta)}</p></div>
      <div class="detail-card"><h4>Prazo de solução</h4><p>${fmtDataHoraCurta(c.prazo_solucao)}</p></div>
    </div>

    <div class="field" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small" id="ch-salvar-status">Salvar alterações</button>
      <a class="btn small" target="_blank" rel="noopener" href="${linkWhatsapp(c.telefone, msgChegou)}">Avisar cliente (recebido)</a>
      <a class="btn small" target="_blank" rel="noopener" href="${linkWhatsapp(c.telefone, msgResolvido)}">Avisar cliente (resolvido)</a>
    </div>

    <div class="panel-card" style="margin-top:8px"><h3>Anexos</h3>${anexosHtml}</div>
  `;

  document.getElementById("ch-salvar-status")?.addEventListener("click", async () => {
    try {
      await API.updateChamado(c.id, {
        status: document.getElementById("ch-edit-status").value,
        prioridade: document.getElementById("ch-edit-prioridade").value,
        responsavel: document.getElementById("ch-edit-responsavel").value.trim() || null,
      });
      toast("Chamado atualizado.", "success");
      chamadoModal.close();
      loadAll();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  document.querySelectorAll("[data-baixar-anexo]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        const url = await API.getAnexoUrl(btn.dataset.baixarAnexo);
        window.open(url, "_blank");
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );

  chamadoModal.showModal();
}
