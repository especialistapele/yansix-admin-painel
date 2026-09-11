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
  clienteAtualId: null,
  produtos: [],
  planos: [],
  contratos: [],
  financeiro: [],
  clientesProdutos: [],
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

async function showApp() {
  loginScreen.style.display = "none";
  appShell.classList.add("active");
  try {
    const { data: { user } } = await SUPABASE_CLIENT.auth.getUser();
    const emailEl = document.getElementById("current-user-email");
    if (emailEl) emailEl.textContent = user?.email || "Sessão autenticada";
  } catch (_) {}
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
    await showApp();
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
  const user = await API.restoreSession();
  if (user) await showApp();
  else showLogin();
})();

// recalcula os badges de SLA (que são baseados em "tempo até agora")
// a cada minuto enquanto a tela de Chamados estiver aberta, sem nova
// consulta ao banco — só reprocessa os dados já carregados em STATE.
setInterval(() => {
  if (document.getElementById("view-chamados")?.classList.contains("active")) {
    renderChamados();
    if (STATE.chamadoAtualId && chamadoModal.open) {
      const slaEl = document.getElementById("chamado-modal-sla");
      const c = STATE.chamados.find((x) => x.id === STATE.chamadoAtualId);
      if (slaEl && c) slaEl.innerHTML = slaBadgeHtml(c);
    }
  }
}, 60000);

// =========================================================
// NAVEGAÇÃO
// =========================================================
function navegarPara(viewId) {
  const view = document.getElementById(`view-${viewId}`);
  const link = document.querySelector(`.nav-link[data-view="${viewId}"]`);
  if (!view || !link) {
    toast(`Tela não encontrada: ${viewId}`, "error");
    return false;
  }
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  link.classList.add("active");
  view.classList.add("active");
  return true;
}

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navegarPara(link.dataset.view);
  });
});

// =========================================================
// CARREGAMENTO GERAL
// =========================================================
async function loadAll() {
  const tarefas = [
    ["clientes", () => API.getClientes(), []],
    ["crms", () => API.getCrms(), []],
    ["ultimaMetricaPorCrm", () => API.getUltimaMetricaPorCrm(), {}],
    ["alertasAbertos", () => API.getAlertas({ apenasAbertos: true }), []],
    ["chamados", () => API.getChamados(), []],
    ["produtos", () => API.getProdutos(), []],
    ["planos", () => API.getPlanos(), []],
    ["contratos", () => API.getContratos(), []],
    ["financeiro", () => API.getFinanceiro(), []],
  ];
  const resultados = await Promise.allSettled(tarefas.map(([, fn]) => fn()));
  const falhas = [];
  const dados = {};
  resultados.forEach((resultado, i) => {
    const [nome, , fallback] = tarefas[i];
    if (resultado.status === "fulfilled") dados[nome] = resultado.value;
    else { dados[nome] = fallback; falhas.push(`${nome}: ${resultado.reason?.message || "erro desconhecido"}`); }
  });
  Object.assign(STATE, dados);
  try {
    STATE.clientesProdutos = (await Promise.all(STATE.clientes.map(c => API.getClienteProdutos(c.id)))).flat();
  } catch (err) {
    STATE.clientesProdutos = [];
    falhas.push(`clientesProdutos: ${err.message || "erro desconhecido"}`);
  }
  renderDashboard(); renderClientes(); renderCrms(); renderMonitoramento(); preencherSelectClientes();
  preencherFiltroClientesChamados();
  renderChamados(); renderContratos(); renderFinanceiro(); preencherSelectProdutos(); preencherSelectContratoFinanceiro(); renderCashback();
  if (falhas.length) {
    console.warn("Falhas no carregamento do painel:", falhas);
    toast(`Alguns dados não puderam ser carregados: ${falhas.join(" | ")}`, "error");
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
function contratoProdutoId(c) {
  return c?.cliente?.produto_id || c?.cliente_produto?.produto_id || null;
}
function contratoProdutoNome(c) {
  return c?.cliente?.produto?.nome || c?.cliente_produto?.produto?.nome || STATE.produtos.find(p=>p.id===contratoProdutoId(c))?.nome || "Produto";
}
function contratoPlano(c) {
  return c?.plano || STATE.planos.find(p=>p.id===c?.plano_id) || null;
}
function ehAssinatura(produtoId) { return produtoId === "crm" || produtoId === "cashback"; }
function contratoEhManutencao(c) {
  const plano=contratoPlano(c);
  const produtoNome=String(contratoProdutoNome(c)||"").toLowerCase();
  const planoNome=String(plano?.nome||"").toLowerCase();
  const condicao=String(c.condicao_pagamento||"").toLowerCase();
  const observacoes=String(c.observacoes||"").toLowerCase();
  return c.possui_manutencao===true || [planoNome,produtoNome,condicao,observacoes].some(t=>t.includes("manuten"));
}
function valorManutencaoContrato(c) {
  const plano=contratoPlano(c);
  const valorManut=Number(c.valor_manutencao||0);
  return valorManut>0 ? valorManut : Number(c.valor_contratado ?? plano?.valor_padrao ?? 0);
}
function resumoReceitaRecorrente() {
  const manutencao = STATE.contratos.filter(c=>c.status==="ativo" && contratoEhManutencao(c))
    .reduce((s,c)=>s+valorManutencaoContrato(c),0);
  const mensalPorProduto = (produtoId) => STATE.contratos.filter(c=>c.status==="ativo" && contratoProdutoId(c)===produtoId && contratoPlano(c)?.periodicidade==="mensal")
    .reduce((s,c)=>s+Number(c.valor_contratado ?? contratoPlano(c)?.valor_padrao ?? 0),0);
  const confeccao = STATE.contratos.filter(c=>c.status==="ativo" && contratoPlano(c)?.periodicidade==="unico" && String(contratoPlano(c)?.nome||"").toLowerCase().includes("confec"))
    .reduce((s,c)=>s+Number(c.valor_contratado ?? contratoPlano(c)?.valor_padrao ?? 0),0);
  return { manutencao, crm: mensalPorProduto("crm"), cashback: mensalPorProduto("cashback"), confeccao };
}
function abrirDetalhesReceita(tipo) {
  const titulo = {manutencao:"Valores de Manutenção",crm:"CRM Mensal",cashback:"Cashback",confeccao:"Confecção (cobrança única)"}[tipo] || "Receita";
  const rows = tipo === "manutencao"
    ? STATE.contratos.filter(c=>c.status==="ativo" && contratoEhManutencao(c))
      .map(c=>{const plano=contratoPlano(c);return {cliente:c.cliente?.cliente?.nome||"—",valor:valorManutencaoContrato(c),plano:plano?.nome||"Manutenção",status:c.status,vencimento:c.proxima_renovacao||"—",produto:contratoProdutoNome(c)}})
    : tipo === "confeccao"
      ? STATE.contratos.filter(c=>c.status==="ativo" && contratoPlano(c)?.periodicidade==="unico" && String(contratoPlano(c)?.nome||"").toLowerCase().includes("confec")).map(c=>({cliente:c.cliente?.cliente?.nome||"—",valor:Number(c.valor_contratado ?? contratoPlano(c)?.valor_padrao ?? 0),plano:contratoPlano(c)?.nome||"—",status:c.status,vencimento:c.data_inicio||"—",produto:contratoProdutoNome(c)}))
      : STATE.contratos.filter(c=>c.status==="ativo" && contratoProdutoId(c)===tipo && contratoPlano(c)?.periodicidade==="mensal").map(c=>({cliente:c.cliente?.cliente?.nome||"—",valor:Number(c.valor_contratado ?? contratoPlano(c)?.valor_padrao ?? 0),plano:contratoPlano(c)?.nome||"—",status:c.status,vencimento:c.proxima_renovacao||"—",produto:contratoProdutoNome(c)}));
  const el=document.getElementById("receita-recorrente-body");
  if(!el)return;
  el.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.cliente)}</td><td>${esc(r.produto)}</td><td>${esc(r.plano)}</td><td>${moeda(r.valor)}</td><td>${esc(statusContratoLabel(r.status))}</td><td>${esc(r.vencimento)}</td></tr>`).join(""):"<tr><td colspan='6'>Nenhum contrato compõe este valor.</td></tr>";
  document.getElementById("receita-recorrente-titulo").textContent=titulo;
  document.getElementById("receita-recorrente-modal").showModal();
}

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

  const recorrente = resumoReceitaRecorrente();
  const dm=document.getElementById("dash-manutencao");
  if(dm) dm.textContent=`${moeda(recorrente.manutencao)}/mês`;
  const dc=document.getElementById("dash-crm-mensal"); if(dc) dc.textContent=moeda(recorrente.crm);
  const dcb=document.getElementById("dash-cashback-mensal"); if(dcb) dcb.textContent=moeda(recorrente.cashback);
  const dconf=document.getElementById("dash-confeccao"); if(dconf) dconf.textContent=moeda(recorrente.confeccao);
  document.getElementById("dash-card-manutencao")?.addEventListener("click",()=>abrirDetalhesReceita("manutencao"));
  document.getElementById("dash-card-crm")?.addEventListener("click",()=>abrirDetalhesReceita("crm"));
  document.getElementById("dash-card-cashback")?.addEventListener("click",()=>abrirDetalhesReceita("cashback"));
  document.getElementById("dash-card-confeccao")?.addEventListener("click",()=>abrirDetalhesReceita("confeccao"));

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
const cliente360Modal = document.getElementById("cliente-360-modal");

function preencherSelectClientes() {
  const ids = ["crm-cliente", "novo-chamado-cliente"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const atual = el.value;
    const placeholder = id === "novo-chamado-cliente" ? "Selecione o cliente" : "Selecione o cliente";
    el.innerHTML = `<option value="">${placeholder}</option>` + STATE.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
    if (atual && STATE.clientes.some(c=>c.id===atual)) el.value=atual;
  });
}

function planosAtivosDoProduto(produtoId) {
  return STATE.planos.filter(p => p.produto_id === produtoId && p.ativo).sort((a,b) => (a.meses_periodo||0) - (b.meses_periodo||0));
}
function preencherProdutosCadastroCliente(selecionados = []) {
  const el = document.getElementById("cliente-produtos-grid");
  if (!el) return;
  const ids = new Set(selecionados);
  el.innerHTML = STATE.produtos.map(p => {
    const planos = planosAtivosDoProduto(p.id);
    const primeiro = planos[0];
    return `
      <div class="client-product-card">
        <label class="client-product-opt">
          <input type="checkbox" name="cliente_produtos" value="${esc(p.id)}" ${ids.has(p.id) ? "checked" : ""}>
          <span><strong>${esc(p.nome)}</strong></span>
        </label>
        <div class="client-product-commercial" data-commercial="${esc(p.id)}" ${ids.has(p.id) ? "" : "hidden"}>
          <div class="field">
            <label>Plano</label>
            <select data-produto-plano="${esc(p.id)}" ${planos.length ? "" : "disabled"}>
              ${planos.length
                ? planos.map(pl => `<option value="${esc(pl.id)}" data-valor="${Number(pl.valor_padrao||0)}">${esc(pl.nome)} · ${esc(pl.periodicidade)} · ${moeda(pl.valor_padrao)}</option>`).join("")
                : `<option value="">Nenhum plano ativo cadastrado</option>`}
            </select>
          </div>
          <div class="field">
            <label>Valor contratado</label>
            <input type="number" step="0.01" min="0" data-produto-valor="${esc(p.id)}" value="${Number(primeiro?.valor_padrao||0).toFixed(2)}" ${planos.length ? "" : ""}>
            <small class="help">${planos.length && Number(primeiro?.valor_padrao||0) > 0 ? "Valor preenchido pelo plano. Você pode ajustar manualmente." : "Informe manualmente o valor deste produto."}</small>
          </div>
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll('input[name="cliente_produtos"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const wrap = el.querySelector(`[data-commercial="${CSS.escape(cb.value)}"]`);
      if (wrap) wrap.hidden = !cb.checked;
      if (cb.checked) {
        const sel = el.querySelector(`[data-produto-plano="${CSS.escape(cb.value)}"]`);
        const val = el.querySelector(`[data-produto-valor="${CSS.escape(cb.value)}"]`);
        const opt = sel?.selectedOptions[0];
        if (opt && val && (!val.value || Number(val.value) === 0)) val.value = Number(opt.dataset.valor||0).toFixed(2);
      }
    });
  });
  el.querySelectorAll("[data-produto-plano]").forEach(sel => {
    sel.addEventListener("change", () => {
      const val = el.querySelector(`[data-produto-valor="${CSS.escape(sel.dataset.produtoPlano)}"]`);
      const opt = sel.selectedOptions[0];
      if (val && opt) val.value = Number(opt.dataset.valor||0).toFixed(2);
    });
  });
}
function dadosProdutosCadastroCliente() {
  return Array.from(document.querySelectorAll('input[name="cliente_produtos"]:checked')).map(cb => {
    const produtoId = cb.value;
    const plano = document.querySelector(`[data-produto-plano="${CSS.escape(produtoId)}"]`);
    const valor = document.querySelector(`[data-produto-valor="${CSS.escape(produtoId)}"]`);
    if (!plano?.value) throw new Error(`Selecione um plano para ${STATE.produtos.find(p=>p.id===produtoId)?.nome || produtoId}.`);
    return { produtoId, planoId: plano.value, valor: Number(valor?.value)||0 };
  });
}
function abrirModalClienteNovo(){
  const m=document.getElementById("cliente-modal"); delete m.dataset.editId;
  document.getElementById("cliente-form").reset(); preencherProdutosCadastroCliente();
  document.getElementById("cliente-modal-titulo").textContent="Novo cliente"; document.getElementById("cliente-salvar").textContent="Criar cliente"; m.showModal();
}
document.getElementById("btn-novo-cliente").addEventListener("click", abrirModalClienteNovo);
document.getElementById("cliente-cancelar").addEventListener("click", () => { clienteModal.close(); delete clienteModal.dataset.editId; });
document.getElementById("cliente-360-fechar")?.addEventListener("click", () => cliente360Modal.close());

document.getElementById("cliente-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload={
    nome:document.getElementById("cliente-nome").value.trim(),
    responsavel:document.getElementById("cliente-responsavel").value.trim()||null,
    email:document.getElementById("cliente-email").value.trim()||null,
    telefone:document.getElementById("cliente-telefone").value.trim()||null,
    observacoes:document.getElementById("cliente-observacoes").value.trim()||null,
    status:"ativo"
  };
  try {
    const comerciais = dadosProdutosCadastroCliente();
    const editId=clienteModal.dataset.editId;
    if(editId){
      await API.updateCliente(editId,payload);
      const atuais=await API.getClienteProdutos(editId);
      const selecionados=new Set(comerciais.map(x=>x.produtoId));
      for(const cp of atuais){ if(!selecionados.has(cp.produto_id)) await API.removeClienteProduto(cp.id); }
      const atuaisIds=new Set(atuais.map(cp=>cp.produto_id));
      for(const item of comerciais){
        if(!atuaisIds.has(item.produtoId)) {
          await API.createClienteProduto({cliente_id:editId,produto_id:item.produtoId,status:"ativo",data_inicio:new Date().toISOString().slice(0,10),observacoes:null});
        }
      }
      // Atualiza contratos em rascunho existentes quando o cliente já tinha a seleção comercial.
      for(const item of comerciais){
        const cp=(await API.getClienteProdutos(editId)).find(x=>x.produto_id===item.produtoId);
        if(!cp) continue;
        const draft=STATE.contratos.find(c=>c.cliente_produto?.cliente_id===editId && c.cliente_produto?.produto_id===item.produtoId && c.status==="rascunho");
        if(draft) await API.updateContrato(draft.id,{plano_id:item.planoId,valor_contratado:item.valor,restante:item.valor});
        else if(!STATE.contratos.some(c=>c.cliente_produto?.cliente_id===editId && c.cliente_produto?.produto_id===item.produtoId && ["ativo","suspenso","encerrado"].includes(c.status))) {
          await API.createContrato({cliente_produto_id:cp.id,plano_id:item.planoId,data_inicio:new Date().toISOString().slice(0,10),data_fim:null,proxima_renovacao:null,valor_contratado:item.valor,status:"rascunho",observacoes:"Contrato comercial criado a partir do cadastro do cliente.",condicao_pagamento:null,entrada:0,restante:item.valor,forma_pagamento:null,comissao_percentual:0,comissao_valor:0,valor_liquido:item.valor,possui_manutencao:false,valor_manutencao:0});
        }
      }
      toast("Cliente atualizado.","success");
    } else {
      const cliente=await API.createCliente(payload);
      for(const item of comerciais){
        const cp=await API.createClienteProduto({cliente_id:cliente.id,produto_id:item.produtoId,status:"ativo",data_inicio:new Date().toISOString().slice(0,10),observacoes:null});
        await API.createContrato({
          cliente_produto_id:cp.id,plano_id:item.planoId,data_inicio:new Date().toISOString().slice(0,10),
          data_fim:null,proxima_renovacao:null,valor_contratado:item.valor,status:"rascunho",
          observacoes:"Contrato comercial criado automaticamente a partir do cadastro do cliente.",
          condicao_pagamento:null,entrada:0,restante:item.valor,forma_pagamento:null,
          comissao_percentual:0,comissao_valor:0,valor_liquido:item.valor,possui_manutencao:false,valor_manutencao:0
        });
      }
      toast(comerciais.length?`Cliente criado com ${comerciais.length} produto(s), plano(s) e contrato(s) em rascunho.`:"Cliente criado. Vincule os produtos antes de abrir chamados.","success");
    }
    clienteModal.close(); delete clienteModal.dataset.editId;
    document.getElementById("cliente-modal-titulo").textContent="Novo cliente";
    document.getElementById("cliente-salvar").textContent="Criar cliente";
    await loadAll();
  } catch(err){toast(err.message,"error");}
});

async function editarCliente(id){
  const c=STATE.clientes.find(x=>x.id===id); if(!c)return toast("Cliente não encontrado.","error");
  document.getElementById("cliente-form").reset();
  const cps=await API.getClienteProdutos(id);
  preencherProdutosCadastroCliente(cps.map(x=>x.produto_id));
  document.getElementById("cliente-nome").value=c.nome||"";
  document.getElementById("cliente-responsavel").value=c.responsavel||"";
  document.getElementById("cliente-email").value=c.email||"";
  document.getElementById("cliente-telefone").value=c.telefone||"";
  document.getElementById("cliente-observacoes").value=c.observacoes||"";
  for(const cp of cps){
    const draft=STATE.contratos.find(x=>x.cliente_produto?.id===cp.id && x.status==="rascunho");
    const sel=document.querySelector(`[data-produto-plano="${CSS.escape(cp.produto_id)}"]`);
    const val=document.querySelector(`[data-produto-valor="${CSS.escape(cp.produto_id)}"]`);
    if(draft){
      if(sel) sel.value=draft.plano_id;
      if(val) val.value=Number(draft.valor_contratado||0).toFixed(2);
    }
  }
  clienteModal.dataset.editId=id;
  document.getElementById("cliente-modal-titulo").textContent="Editar cliente";
  document.getElementById("cliente-salvar").textContent="Salvar alterações";
  clienteModal.showModal();
}

function renderClientes() {
  const tbody = document.getElementById("clientes-tbody");
  const emptyEl = document.getElementById("clientes-empty");
  if (!STATE.clientes.length) { tbody.innerHTML = ""; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  tbody.innerHTML = STATE.clientes.map(c => `
    <tr>
      <td><strong>${esc(c.nome)}</strong></td>
      <td>${esc(c.responsavel || "—")}</td>
      <td>${((STATE.clientesProdutos||[]).filter(cp=>cp.cliente_id===c.id).map(cp=>cp.produto?.nome||cp.produto_id)).join(", ") || "—"}</td>
      <td>${esc(c.email || "—")}</td>
      <td>${esc(c.telefone || "—")}</td>
      <td><span class="badge ${c.status}">${labelStatus(c.status)}</span></td>
      <td>${fmtDataHora(c.criado_em)}</td>
      <td><div class="table-actions client-actions"><button class="btn small" data-cliente-edit="${esc(c.id)}">Editar</button><button class="btn small primary" data-cliente-id="${esc(c.id)}">Abrir 360</button><button class="btn small danger" data-cliente-delete="${esc(c.id)}">Excluir</button></div></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-cliente-id]").forEach(btn => btn.addEventListener("click", () => abrirCliente360(btn.getAttribute("data-cliente-id"))));
  tbody.querySelectorAll("[data-cliente-edit]").forEach(btn => btn.addEventListener("click", () => editarCliente(btn.getAttribute("data-cliente-edit"))));
  tbody.querySelectorAll("[data-cliente-delete]").forEach(btn => btn.addEventListener("click", async () => {
    const id=btn.getAttribute("data-cliente-delete"), c=STATE.clientes.find(x=>x.id===id);
    if(!c || !confirm(`Excluir o cliente ${c.nome} e todos os contratos, cobranças, pagamentos, chamados e vínculos dele? Esta ação não pode ser desfeita.`)) return;
    try{ await API.removeCliente(id); toast("Cliente excluído.","success"); await loadAll(); }catch(e){ toast(e.message,"error"); }
  }));
}

function esc(v) {
  return String(v ?? "").replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[ch]));
}

function moeda(v) {
  return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeGenerica(status) {
  const cls = ["ativo","pago"].includes(status) ? "ativo" : ["cancelado","encerrado","inativo"].includes(status) ? "inativo" : "em_implantacao";
  return `<span class="badge ${cls}">${esc(status || "—")}</span>`;
}

async function abrirCliente360(id) {
  const clienteId = String(typeof id === "object" ? (id?.id || id?.cliente_id || "") : (id || "")).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId)) {
    toast("Não foi possível abrir o Cliente 360: identificador do cliente inválido.", "error");
    return;
  }
  STATE.clienteAtualId = clienteId;
  const body = document.getElementById("cliente-360-body");
  body.innerHTML = `<div class="empty">Carregando visão 360...</div>`;
  cliente360Modal.showModal();
  try {
    const d = await API.getCliente360(clienteId);
    const c = d.cliente;
    if (!c) throw new Error("Cliente não encontrado.");
    document.getElementById("cliente-360-titulo").textContent = `${c.nome} · Cliente 360`;
    const pagos = d.financeiro.filter(f => f.status === "pago").reduce((a,f)=>a+Number(f.valor_pago||0),0);
    const pendentes = d.financeiro.filter(f => ["pendente","em_atraso"].includes(f.status)).reduce((a,f)=>a+Number(f.valor_previsto||0),0);
    const timeline = [
      ...d.chamados.map(x=>({data:x.criado_em,tipo:"Chamado",texto:`${x.numero || "Chamado"} · ${x.assunto} · ${labelChamadoStatus(x.status)}`})),
      ...d.contratos.map(x=>({data:x.criado_em,tipo:"Contrato",texto:`${x.numero || "Contrato"} · ${x.cliente_produto?.produto?.nome || "Produto"} · ${x.status}`})),
      ...d.financeiro.map(x=>({data:x.data_pagamento || x.data_vencimento || x.criado_em,tipo:"Financeiro",texto:`${x.status} · ${moeda(x.valor_pago ?? x.valor_previsto)}`}))
    ].sort((a,b)=>new Date(b.data)-new Date(a.data));
    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card"><h4>Empresa</h4><p>${esc(c.nome)}</p></div>
        <div class="detail-card"><h4>Responsável</h4><p>${esc(c.responsavel || "—")}</p></div>
        <div class="detail-card"><h4>Contato</h4><p>${esc(c.email || "—")}<br>${esc(c.telefone || "—")}</p></div>
        <div class="detail-card"><h4>Status</h4><p>${badgeGenerica(c.status)}</p></div>
      </div>
      ${c.observacoes ? `<div class="field"><label>Observações</label><p style="white-space:pre-wrap">${esc(c.observacoes)}</p></div>` : ""}

      <div class="panel-card"><h3>Resumo comercial</h3><div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="label">Produtos</div><div class="value mono">${d.produtos.length}</div></div>
        <div class="stat-card"><div class="label">Contratos</div><div class="value mono">${d.contratos.length}</div></div>
        <div class="stat-card"><div class="label">Chamados</div><div class="value mono">${d.chamados.length}</div></div>
        <div class="stat-card"><div class="label">Pago</div><div class="value mono">${moeda(pagos)}</div></div>
        <div class="stat-card"><div class="label">Em aberto</div><div class="value mono">${moeda(pendentes)}</div></div>
      </div></div>

      <div class="panel-card"><div class="section-head"><h3>Produtos contratados</h3><button class="btn small" id="btn-360-vincular-produto">+ Vincular produto</button></div>${d.produtos.length ? d.produtos.map(x=>`<div class="crm-row"><div><div class="name">${esc(x.produto?.nome || x.produto_id)}</div><div class="meta">Início: ${x.data_inicio ? fmtDataHora(x.data_inicio) : "—"} · ${esc(x.status)}</div></div><div class="spacer"></div>${badgeGenerica(x.status)}</div>`).join("") : `<div class="empty">Nenhum produto vinculado ainda.</div>`}</div>

      <div class="panel-card"><h3>Contratos</h3>${d.contratos.length ? d.contratos.map(x=>`<div class="crm-row"><div><div class="name">${esc(x.numero || "Sem número")} · ${esc(x.cliente_produto?.produto?.nome || "Produto")}</div><div class="meta">${x.plano?.nome ? esc(x.plano.nome)+" · " : ""}${x.periodicidade || x.plano?.periodicidade || ""} · ${moeda(x.valor_contratado)} · renovação ${x.proxima_renovacao || "—"}</div></div><div class="spacer"></div><button class="btn small" data-contrato-documento="${x.id}">📎 Contrato</button>${badgeGenerica(x.status)}</div>`).join("") : `<div class="empty">Nenhum contrato cadastrado.</div>`}</div>

      <div class="panel-card"><h3>Financeiro</h3>${d.financeiro.length ? d.financeiro.slice(0,12).map(x=>`<div class="crm-row"><div><div class="name">${esc(x.periodo_inicio || "Período")} → ${esc(x.periodo_fim || "—")}</div><div class="meta">Vencimento: ${esc(x.data_vencimento || "—")} · Pagamento: ${esc(x.data_pagamento || "—")} · ${moeda(x.valor_pago ?? x.valor_previsto)}</div></div><div class="spacer"></div>${badgeGenerica(x.status)}</div>`).join("") : `<div class="empty">Nenhum lançamento financeiro.</div>`}</div>

      <div class="panel-card"><h3>Chamados por produto</h3>${d.chamados.length ? CONFIG.PRODUTOS.filter(p=>d.chamados.some(x=>x.produto===p.id)).map(p=>{const cs=d.chamados.filter(x=>x.produto===p.id);return `<div class="subsection"><div class="section-head"><strong>${esc(p.nome)}</strong><span class="meta">${cs.length} chamado(s)</span></div>${cs.slice(0,12).map(x=>`<div class="crm-row"><div><div class="name">${esc(x.numero)} · ${esc(x.assunto)}</div><div class="meta">${fmtDataHora(x.criado_em)} · ${esc(x.solicitante||"")}</div></div><div class="spacer"></div>${badgeGenerica(x.status)}</div>`).join("")}</div>`;}).join("") : `<div class="empty">Nenhum chamado vinculado a este cliente.</div>`}</div>

      <div class="panel-card"><h3>CRMs</h3>${d.crms.length ? d.crms.map(x=>`<div class="crm-row"><div><div class="name">${esc(x.slug)}</div><div class="meta">${esc(x.url_publica || "Sem URL")}</div></div><div class="spacer"></div>${badgeGenerica(x.status)}</div>`).join("") : `<div class="empty">Nenhum CRM vinculado.</div>`}</div>

      <div class="panel-card"><h3>Histórico 360</h3>${timeline.length ? timeline.slice(0,30).map(e=>`<div class="crm-row"><div><div class="name">${esc(e.tipo)}</div><div class="meta">${esc(e.texto)}</div></div><div class="spacer"></div><div class="meta">${fmtDataHora(e.data)}</div></div>`).join("") : `<div class="empty">Ainda não há eventos comerciais registrados.</div>`}</div>`;
  } catch (err) { body.innerHTML = `<div class="empty">Não foi possível carregar o Cliente 360: ${esc(err.message)}</div>`; }
}

// =========================================================
// CASHBACK + AÇÕES DO CLIENTE 360
// =========================================================
function renderCashback(){
  const tbody=document.getElementById("cb-tbody"); if(!tbody)return;
  const produto=STATE.produtos.find(p=>(p.nome||"").toLowerCase().includes("cashback"));
  if(!produto){tbody.innerHTML="";return;}
  const busca=(document.getElementById("cb-busca")?.value||"").toLowerCase();
  const st=document.getElementById("cb-status")?.value||"";
  const per=document.getElementById("cb-periodicidade")?.value||"";
  const cps=STATE.clientesProdutos.filter(x=>x.produto_id===produto.id).filter(x=>!st||x.status===st).filter(x=>{const c=STATE.clientes.find(c=>c.id===x.cliente_id);return !busca||(c?.nome||"").toLowerCase().includes(busca)});
  const contratos=STATE.contratos.filter(c=>c.cliente?.produto_id===produto.id);
  const ativos=contratos.filter(c=>c.status==="ativo");
  const f=STATE.financeiro.filter(x=>x.contrato?.cliente_produto?.produto_id===produto.id);
  document.getElementById("cb-clientes").textContent=cps.length;document.getElementById("cb-contratos").textContent=ativos.length;document.getElementById("cb-pago").textContent=moeda(f.reduce((a,x)=>a+Number(x.valor_pago||0),0));document.getElementById("cb-aberto").textContent=moeda(f.filter(x=>["pendente","em_atraso"].includes(x.status)).reduce((a,x)=>a+Number(x.valor_previsto||0),0));
  const rows=cps.map(cp=>{const c=STATE.clientes.find(c=>c.id===cp.cliente_id);const ctr=contratos.filter(x=>x.cliente?.cliente_id===cp.cliente_id);const plan=ctr.find(x=>x.status==="ativo")?.plano;return {cp,c,ctr,plan};}).filter(r=>!per||r.plan?.periodicidade===per);
  document.getElementById("cb-empty").hidden=rows.length>0;
  tbody.innerHTML=rows.map(r=>`<tr><td><strong>${esc(r.c?.nome||"—")}</strong></td><td>${esc(r.c?.responsavel||"—")}</td><td>${esc(r.c?.email||"—")}<br>${esc(r.c?.telefone||"—")}</td><td>${esc(r.plan?.nome||"—")}<div class="meta">${esc(r.plan?.periodicidade||"")}</div></td><td>${r.cp.data_inicio||"—"}</td><td>${r.ctr.find(x=>x.status==="ativo")?.proxima_renovacao||"—"}</td><td>${badgeGenerica(r.cp.status)}</td><td><button class="btn small primary" data-cb-360="${r.c.id}">Abrir 360</button></td></tr>`).join("");
  tbody.querySelectorAll("[data-cb-360]").forEach(b=>b.addEventListener("click",()=>abrirCliente360(b.getAttribute("data-cb-360"))));
}
["cb-busca","cb-status","cb-periodicidade"].forEach(id=>document.getElementById(id)?.addEventListener("input",renderCashback));

document.addEventListener("click",e=>{
  const b=e.target.closest("#btn-360-vincular-produto"); if(!b)return;
  const m=document.getElementById("cliente-produto-modal");
  const sel=document.getElementById("cp-produto");
  const usados=new Set((STATE.clientesProdutos||[]).filter(x=>x.cliente_id===STATE.clienteAtualId).map(x=>x.produto_id));
  sel.innerHTML=STATE.produtos.filter(p=>!usados.has(p.id)).map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join("");
  atualizarPlanosVinculo();
  document.getElementById("cp-inicio").value=new Date().toISOString().slice(0,10);
  if(sel.options.length) m.showModal(); else toast("Este cliente já possui todos os produtos vinculados.","info");
});
function atualizarPlanosVinculo(){
  const produtoId=document.getElementById("cp-produto")?.value; const ps=document.getElementById("cp-plano"); if(!ps)return;
  const planos=STATE.planos.filter(p=>p.produto_id===produtoId && p.ativo);
  ps.innerHTML=planos.length?planos.map(p=>`<option value="${p.id}" data-valor="${Number(p.valor_padrao||0)}">${esc(p.nome)} — ${esc(p.periodicidade)} — ${moeda(p.valor_padrao)}</option>`).join(""):`<option value="">Sem plano ativo</option>`;
  const v=ps.selectedOptions[0]?.dataset.valor; document.getElementById("cp-valor").value=v!=null?v:"0";
}
document.getElementById("cp-produto")?.addEventListener("change",atualizarPlanosVinculo);
document.getElementById("cp-plano")?.addEventListener("change",e=>{const v=e.target.selectedOptions[0]?.dataset.valor;if(v!=null)document.getElementById("cp-valor").value=v;});
document.getElementById("cp-fechar")?.addEventListener("click",()=>document.getElementById("cliente-produto-modal").close());
document.getElementById("cliente-produto-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const produtoId=document.getElementById("cp-produto").value, planoId=document.getElementById("cp-plano").value;
    if(!produtoId||!planoId) throw new Error("Selecione o produto e um plano ativo.");
    const valor=Number(document.getElementById("cp-valor").value)||0;
    const cp=await API.createClienteProduto({cliente_id:STATE.clienteAtualId,produto_id:produtoId,status:document.getElementById("cp-status").value,data_inicio:document.getElementById("cp-inicio").value||null,observacoes:document.getElementById("cp-observacoes").value.trim()||null});
    await API.createContrato({cliente_produto_id:cp.id,plano_id:planoId,data_inicio:document.getElementById("cp-inicio").value,valor_contratado:valor,status:"rascunho",entrada:0,restante:valor,comissao_percentual:0,comissao_valor:0,valor_liquido:valor,possui_manutencao:false,valor_manutencao:0,observacoes:"Contrato criado a partir do vínculo do Cliente 360."});
    document.getElementById("cliente-produto-modal").close();toast("Produto, plano e contrato vinculados ao cliente.","success");await loadAll();abrirCliente360(STATE.clienteAtualId);
  }catch(err){toast(err.message,"error");}
});

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
  document.getElementById("crm-cliente").disabled = false;
  document.getElementById("crm-modal-titulo").textContent = "Cadastrar CRM";
  document.getElementById("crm-salvar").textContent = "Cadastrar CRM";
  delete crmModal.dataset.editId;
  crmModal.showModal();
});
document.getElementById("crm-fechar").addEventListener("click", () => { crmModal.close(); delete crmModal.dataset.editId; document.getElementById("crm-cliente").disabled = false; document.getElementById("crm-modal-titulo").textContent = "Cadastrar CRM"; document.getElementById("crm-salvar").textContent = "Cadastrar CRM"; });

document.getElementById("crm-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const clienteId = document.getElementById("crm-cliente").value;
  const slug = document.getElementById("crm-slug").value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const payload = {
    cliente_id: clienteId,
    slug,
    url_publica: document.getElementById("crm-url").value.trim() || null,
    supabase_url: document.getElementById("crm-supabase-url").value.trim(),
    supabase_anon_key: document.getElementById("crm-supabase-key").value.trim(),
    status: document.getElementById("crm-status").value,
  };
  try {
    if (crmModal.dataset.editId) {
      await API.updateCrm(crmModal.dataset.editId, payload);
      toast("CRM atualizado.", "success");
    } else {
      await API.createCrm(payload);
      toast("CRM cadastrado para monitoramento.", "success");
    }
    crmModal.close();
    delete crmModal.dataset.editId;
    document.getElementById("crm-cliente").disabled = false;
    document.getElementById("crm-modal-titulo").textContent = "Cadastrar CRM";
    document.getElementById("crm-salvar").textContent = "Cadastrar CRM";
    loadAll();
  } catch (err) { toast(err.message, "error"); }
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
      <td>${esc(nomeCliente(crm.cliente_id))}</td>
      <td class="mono">${esc(crm.slug)}</td>
      <td><span class="badge ${esc(crm.status)}">${labelStatus(crm.status)}</span></td>
      <td><span class="status-dot ${nivel}"></span> <span class="mono" style="font-size:12px">${pct}%</span></td>
      <td>${fmtDataHora(crm.ultima_verificacao)}</td>
      <td style="text-align:right;white-space:nowrap">
        ${crm.url_publica ? `<a class="btn small" href="${esc(crm.url_publica)}" target="_blank" rel="noopener">Abrir</a>` : ""}
        <button class="btn small" data-crm-editar="${crm.id}">Editar</button>
      </td>
    </tr>`;
    })
    .join("");
  tbody.querySelectorAll("[data-crm-editar]").forEach((btn) => btn.addEventListener("click", () => editarCrm(btn.dataset.crmEditar)));
}

async function editarCrm(id) {
  const crm = STATE.crms.find(x => x.id === id);
  if (!crm) return toast("CRM não encontrado.", "error");
  document.getElementById("crm-form").reset();
  preencherSelectClientes();
  document.getElementById("crm-cliente").value = crm.cliente_id || "";
  document.getElementById("crm-cliente").disabled = true;
  document.getElementById("crm-slug").value = crm.slug || "";
  document.getElementById("crm-url").value = crm.url_publica || "";
  document.getElementById("crm-supabase-url").value = crm.supabase_url || "";
  document.getElementById("crm-supabase-key").value = crm.supabase_anon_key || "";
  document.getElementById("crm-status").value = crm.status || "ativo";
  document.getElementById("crm-modal-titulo").textContent = "Editar CRM";
  document.getElementById("crm-salvar").textContent = "Salvar alterações";
  crmModal.dataset.editId = id;
  crmModal.showModal();
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

// =========================================================
// FASE 3 — CONTRATOS / PLANOS / FINANCEIRO
// =========================================================
function preencherSelectProdutos() {
  const html = STATE.produtos.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join("");
  const plano = document.getElementById("plano-produto");
  if (plano) plano.innerHTML = html;
  for (const id of ["contratos-filtro-produto","financeiro-filtro-produto"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Todos os produtos</option>${html}`;
  }
}
function statusContratoLabel(v){return ({rascunho:"Rascunho",ativo:"Ativo",suspenso:"Suspenso",encerrado:"Encerrado",cancelado:"Cancelado"})[v]||v;}
function statusFinanceiroLabel(v){return ({pago:"Pago",pendente:"Pendente",parcial:"Parcial",em_atraso:"Em atraso",cancelado:"Cancelado"})[v]||v;}

let contratoDocumentoAtualId = null;
async function abrirDocumentoContrato(contratoId){
  const c=STATE.contratos.find(x=>x.id===contratoId); if(!c)return toast("Contrato não encontrado.","error");
  contratoDocumentoAtualId=contratoId;
  const modal=document.getElementById("contrato-documento-modal");
  const atual=document.getElementById("contrato-documento-atual");
  document.getElementById("contrato-documento-form").reset();
  document.getElementById("contrato-documento-titulo").textContent=`Contrato ${c.numero||"—"} · ${c.cliente?.cliente?.nome||"Cliente"}`;
  atual.innerHTML='<div class="empty">Carregando documento...</div>';
  modal.showModal();
  try{
    const doc=await API.getContratoDocumento(contratoId);
    atual.innerHTML=doc
      ? `<div class="name">📎 ${esc(doc.nome_arquivo)}</div><div class="meta">Enviado em ${new Date(doc.criado_em).toLocaleString("pt-BR")} · ${doc.tamanho_bytes?formatBytes(doc.tamanho_bytes):"tamanho não informado"}</div><div class="table-actions" style="margin-top:10px"><button type="button" class="btn small primary" data-doc-download="${doc.id}">⬇️ Download</button><button type="button" class="btn small danger" data-doc-delete="${doc.id}">Excluir documento</button></div>`
      : '<div class="empty">Nenhum contrato anexado a este cadastro.</div>';
  }catch(e){ atual.innerHTML=`<div class="empty">Não foi possível carregar o documento: ${esc(e.message)}</div>`; }
}
function formatBytes(bytes){
  const n=Number(bytes)||0; if(n<1024)return `${n} B`; if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`; return `${(n/(1024*1024)).toFixed(1)} MB`;
}

document.getElementById("contrato-documento-fechar")?.addEventListener("click",()=>document.getElementById("contrato-documento-modal").close());
document.getElementById("contrato-documento-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const file=document.getElementById("contrato-documento-arquivo").files?.[0];
  if(!contratoDocumentoAtualId||!file)return toast("Selecione o arquivo do contrato.","error");
  const btn=document.getElementById("contrato-documento-enviar"); btn.disabled=true; btn.textContent="Enviando...";
  try{await API.uploadContratoDocumento(contratoDocumentoAtualId,file);toast("Contrato enviado com sucesso.","success");await abrirDocumentoContrato(contratoDocumentoAtualId);}catch(e){toast(e.message,"error");}finally{btn.disabled=false;btn.textContent="Enviar contrato";}
});
document.addEventListener("click",async e=>{
  const d=e.target.closest("[data-doc-download]");
  if(d){
    try{const doc=await API.getContratoDocumento(contratoDocumentoAtualId);const url=await API.downloadContratoDocumento(doc);if(url)window.open(url,"_blank","noopener");}catch(err){toast(err.message,"error");} return;
  }
  const del=e.target.closest("[data-doc-delete]");
  if(del){
    if(!confirm("Excluir o documento deste contrato? Esta ação não pode ser desfeita."))return;
    try{const doc=await API.getContratoDocumento(contratoDocumentoAtualId);await API.removeContratoDocumento(doc);toast("Documento excluído.","success");await abrirDocumentoContrato(contratoDocumentoAtualId);}catch(err){toast(err.message,"error");}
  }
});

function renderContratos(){
  const tbody=document.getElementById("contratos-tbody"); if(!tbody)return;
  const produto=document.getElementById("contratos-filtro-produto")?.value||"";
  const status=document.getElementById("contratos-filtro-status")?.value||"";
  const busca=(document.getElementById("contratos-busca-produto")?.value||"").trim().toLowerCase();
  const rows=STATE.contratos.filter(x=>{
    const nomeProduto=(x.cliente?.produto?.nome||"").toLowerCase();
    return (!produto||x.cliente?.produto_id===produto)&&(!status||x.status===status)&&(!busca||nomeProduto.includes(busca));
  });
  document.getElementById("contratos-empty").hidden=rows.length>0;
  tbody.innerHTML=rows.map(x=>`<tr>
    <td class="mono">${esc(x.numero||"—")}</td><td>${esc(x.cliente?.cliente?.nome||"—")}</td>
    <td>${esc(x.cliente?.produto?.nome||"—")}</td><td>${esc(x.plano?.nome||"—")}<div class="meta">${esc(x.plano?.periodicidade||"")}</div></td>
    <td>${moeda(x.valor_contratado)}</td><td>${x.proxima_renovacao||"—"}</td>
    <td><select class="compact-select" data-contrato-status="${x.id}"><option value="rascunho" ${x.status==="rascunho"?"selected":""}>Rascunho</option><option value="ativo" ${x.status==="ativo"?"selected":""}>Ativo</option><option value="suspenso" ${x.status==="suspenso"?"selected":""}>Suspenso</option><option value="encerrado" ${x.status==="encerrado"?"selected":""}>Encerrado</option><option value="cancelado" ${x.status==="cancelado"?"selected":""}>Cancelado</option></select></td>
    <td><div class="table-actions"><button class="btn small" data-gerar-fin="${x.id}" ${x.status!=="ativo"?"disabled":""}>Gerar cobrança</button><button class="btn small" data-contrato-documento="${x.id}">📎 Contrato</button><button class="btn small danger" data-delete-contrato="${x.id}">Excluir</button></div></td>
  </tr>`).join("");
  tbody.querySelectorAll("[data-gerar-fin]").forEach(btn=>btn.addEventListener("click",async()=>{
    try{await API.gerarProximoLancamento(btn.dataset.gerarFin);toast("Próxima cobrança gerada e vinculada ao cliente no Financeiro.","success");await loadAll();navegarPara("financeiro");}
    catch(e){toast(e.message,"error");}
  }));
  tbody.querySelectorAll("[data-contrato-documento]").forEach(btn=>btn.addEventListener("click",()=>abrirDocumentoContrato(btn.dataset.contratoDocumento)));
  tbody.querySelectorAll("[data-contrato-status]").forEach(sel=>sel.addEventListener("change",async()=>{
    try{await API.updateContrato(sel.dataset.contratoStatus,{status:sel.value});toast("Status do contrato atualizado.","success");await loadAll();}catch(e){toast(e.message,"error");await loadAll();}
  }));
  tbody.querySelectorAll("[data-delete-contrato]").forEach(btn=>btn.addEventListener("click",async()=>{
    const x=STATE.contratos.find(c=>c.id===btn.dataset.deleteContrato);
    if(!x||!confirm(`Excluir o contrato de ${x.cliente?.cliente?.nome||"cliente"} e suas cobranças/pagamentos?`))return;
    try{await API.removeContrato(btn.dataset.deleteContrato);toast("Contrato excluído.","success");await loadAll();}catch(e){toast(e.message,"error");}
  }));
  renderPlanos();
}
function renderPlanos(){
  const el=document.getElementById("planos-list");if(!el)return;
  const produtoFiltro=document.getElementById("contratos-filtro-produto")?.value||"";
  const busca=(document.getElementById("contratos-busca-produto")?.value||"").trim().toLowerCase();
  const rows=[...STATE.planos].filter(p=>(!produtoFiltro||p.produto_id===produtoFiltro)&&(!busca||(p.produto?.nome||"").toLowerCase().includes(busca))).sort((a,b)=>(a.produto?.nome||"").localeCompare(b.produto?.nome||"") || (a.meses_periodo||0)-(b.meses_periodo||0));
  el.innerHTML=rows.length?rows.map(p=>`<div class="crm-row">
    <div><div class="name">${esc(p.produto?.nome||"Produto")} · ${esc(p.nome)}</div><div class="meta">${esc(p.periodicidade)} · ${moeda(p.valor_padrao)} · ${p.ativo?"Ativo":"Inativo"}</div></div>
    <div class="spacer"></div><button class="btn small" data-editar-plano="${p.id}">Editar</button>
  </div>`).join(""): `<div class="empty">Nenhum plano cadastrado.</div>`;
  el.querySelectorAll("[data-editar-plano]").forEach(b=>b.addEventListener("click",()=>editarPlano(b.dataset.editarPlano)));
}
function configurarPeriodicidadePlano(){
  const produtoId=document.getElementById("plano-produto")?.value;
  const sel=document.getElementById("plano-periodicidade"); if(!sel)return;
  const assinatura=ehAssinatura(produtoId);
  sel.innerHTML=assinatura
    ? `<option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option>`
    : `<option value="unico">Único</option><option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option>`;
}
async function editarPlano(id){
  const p=STATE.planos.find(x=>x.id===id); if(!p)return toast("Plano não encontrado.","error");
  document.getElementById("plano-form").reset(); preencherSelectProdutos();
  document.getElementById("plano-produto").value=p.produto_id; document.getElementById("plano-produto").disabled=true;
  configurarPeriodicidadePlano(); document.getElementById("plano-periodicidade").value=p.periodicidade;
  document.getElementById("plano-nome").value=p.nome||""; document.getElementById("plano-valor").value=p.valor_padrao??0; document.getElementById("plano-ativo").value=String(p.ativo);
  document.getElementById("plano-modal-titulo").textContent="Editar plano"; document.getElementById("plano-modal").dataset.editId=id; document.getElementById("plano-modal").showModal();
}
function resetPlanoModal(){
  const m=document.getElementById("plano-modal"); document.getElementById("plano-produto").disabled=false; document.getElementById("plano-modal-titulo").textContent="Novo plano"; delete m.dataset.editId;
}

function preencherSelectContratoFinanceiro(){
  const el=document.getElementById("financeiro-contrato");if(!el)return;
  el.innerHTML=`<option value="">Selecione o contrato</option>`+STATE.contratos.map(x=>`<option value="${x.id}">${esc(x.numero||"Sem número")} · ${esc(x.cliente?.cliente?.nome||"Cliente")} · ${esc(x.cliente?.produto?.nome||"Produto")}</option>`).join("");
}
function financeiroStatusEfetivo(x, hoje=new Date()){
  if(["pago","cancelado"].includes(x.status)) return x.status;
  const venc=x.data_vencimento?new Date(x.data_vencimento+"T12:00:00"):null;
  const saldo=Math.max(Number(x.valor_previsto||0)-Number(x.valor_pago||0),0);
  if(saldo>0 && venc && venc<new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate())) return "em_atraso";
  return x.status;
}
function addDaysDate(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function renderFinanceiro(){
  const tbody=document.getElementById("financeiro-tbody");if(!tbody)return;
  const produto=document.getElementById("financeiro-filtro-produto")?.value||"";
  const status=document.getElementById("financeiro-filtro-status")?.value||"";
  const busca=(document.getElementById("financeiro-busca-cliente")?.value||"").trim().toLowerCase();
  const inicio=document.getElementById("financeiro-data-inicio")?.value||"";
  const fim=document.getElementById("financeiro-data-fim")?.value||"";
  const rapido=document.getElementById("financeiro-periodo-rapido")?.value||"";
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const fim7=addDaysDate(hoje,7);
  const inicioMes=new Date(hoje.getFullYear(),hoje.getMonth(),1);
  const fimMes=new Date(hoje.getFullYear(),hoje.getMonth()+1,0);
  const toDate=x=>x?new Date(x+"T12:00:00"):null;
  let rows=STATE.financeiro.filter(x=>{
    const nome=String(x.contrato?.cliente_produto?.cliente?.nome||"").toLowerCase();
    const venc=toDate(x.data_vencimento); const efetivo=financeiroStatusEfetivo(x,hoje);
    if(produto&&x.contrato?.cliente_produto?.produto_id!==produto)return false;
    if(status&&efetivo!==status)return false;
    if(busca&&!nome.includes(busca))return false;
    if(inicio&&(!venc||venc<toDate(inicio)))return false;
    if(fim&&(!venc||venc>toDate(fim)))return false;
    if(rapido==="hoje"&&(!venc||venc.getTime()!==hoje.getTime()))return false;
    if(rapido==="7dias"&&(!venc||venc<hoje||venc>fim7))return false;
    if(rapido==="mes"&&(!venc||venc<inicioMes||venc>fimMes))return false;
    if(rapido==="atrasados"&&efetivo!=="em_atraso")return false;
    return true;
  });
  const all=STATE.financeiro;
  const saldo=x=>Math.max(Number(x.valor_previsto||0)-Number(x.valor_pago||0),0);
  const sum=(arr,fn)=>arr.reduce((a,x)=>a+Number(fn(x)||0),0);
  const previsto=sum(all,x=>x.status!=="cancelado"?x.valor_previsto:0);
  const recebido=sum(all,x=>x.valor_pago);
  const aberto=sum(all,x=>financeiroStatusEfetivo(x,hoje)!=="pago"&&x.status!=="cancelado"?saldo(x):0);
  const atrasado=sum(all,x=>financeiroStatusEfetivo(x,hoje)==="em_atraso"?saldo(x):0);
  const venceHoje=sum(all,x=>{const d=toDate(x.data_vencimento);return d&&d.getTime()===hoje.getTime()?saldo(x):0});
  const prox7=sum(all,x=>{const d=toDate(x.data_vencimento);return d&&d>=hoje&&d<=fim7?saldo(x):0});
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=moeda(v)};
  set("fin-previsto",previsto);set("fin-pago",recebido);set("fin-pendente",aberto);set("fin-atrasado",atrasado);set("fin-hoje",venceHoje);set("fin-7dias",prox7);
  const mes=all.filter(x=>{const d=toDate(x.data_vencimento);return d&&d>=inicioMes&&d<=fimMes&&x.status!=="cancelado"});
  set("fin-mes-previsto",sum(mes,x=>x.valor_previsto));
  set("fin-mes-aberto",sum(mes,x=>saldo(x)));
  const recebidoMes=sum(all,x=>{const d=x.data_pagamento?toDate(x.data_pagamento):null;return d&&d>=inicioMes&&d<=fimMes?x.valor_pago:0});
  set("fin-mes-recebido",recebidoMes);
  rows.sort((a,b)=>String(a.data_vencimento||"").localeCompare(String(b.data_vencimento||"")));
  document.getElementById("financeiro-empty").hidden=rows.length>0;
  tbody.innerHTML=rows.map(x=>{const c=x.contrato||{};const plano=c.plano;const total=Number(x.valor_previsto||c.valor_contratado||0);const pago=Number(x.valor_pago||0);const restante=Math.max(total-pago,0);const efetivo=financeiroStatusEfetivo(x,hoje);return `<tr><td><button class="btn link-like" data-fin-cliente="${esc(c.cliente_produto?.cliente_id||"")}">${esc(c.cliente_produto?.cliente?.nome||"—")}</button></td><td>${esc(c.cliente_produto?.produto?.nome||"—")}</td><td>${esc(plano?.nome||"—")}<div class="meta">${esc(plano?.periodicidade||"")}</div></td><td>${x.data_vencimento||"—"}</td><td>${moeda(total)}</td><td>${moeda(pago)}</td><td>${moeda(restante)}</td><td>${badgeGenerica(efetivo)}</td><td><div class="table-actions"><button class="btn small" data-fin-situacao="${x.id}">Ver situação</button><button class="btn small danger" data-fin-delete="${x.id}">Excluir</button></div></td></tr>`;}).join("");
}

const planoModal=document.getElementById("plano-modal"),contratoModal=document.getElementById("contrato-modal"),financeiroModal=document.getElementById("financeiro-modal");
document.getElementById("btn-novo-plano")?.addEventListener("click",()=>{resetPlanoModal();document.getElementById("plano-form").reset();preencherSelectProdutos();configurarPeriodicidadePlano();planoModal.showModal();});
document.getElementById("plano-fechar")?.addEventListener("click",()=>{planoModal.close();resetPlanoModal();});
document.getElementById("plano-produto")?.addEventListener("change",configurarPeriodicidadePlano);
document.getElementById("plano-form")?.addEventListener("submit",async e=>{e.preventDefault();try{const p=document.getElementById("plano-periodicidade").value;const payload={produto_id:document.getElementById("plano-produto").value,nome:document.getElementById("plano-nome").value.trim(),periodicidade:p,meses_periodo:{unico:1,mensal:1,trimestral:3,anual:12}[p],valor_padrao:Number(document.getElementById("plano-valor").value)||0,ativo:document.getElementById("plano-ativo").value==="true"};if(planoModal.dataset.editId) await API.updatePlano(planoModal.dataset.editId,payload); else await API.createPlano(payload);planoModal.close();resetPlanoModal();toast("Plano salvo.","success");await loadAll();}catch(e){toast(e.message,"error");}});
function atualizarProdutosClienteContrato(){
  const clienteId=document.getElementById("contrato-cliente").value,el=document.getElementById("contrato-cliente-produto");
  const cps=STATE.clientesProdutosTemporarios||[];
  el.innerHTML=`<option value="">Selecione o produto</option>`+cps.filter(x=>x.cliente_id===clienteId).map(x=>`<option value="${x.id}" data-produto="${x.produto_id}">${esc(x.produto?.nome||x.produto_id)}</option>`).join("");
  atualizarPlanosContrato();
}
async function carregarProdutosDoClienteParaContrato(id){STATE.clientesProdutosTemporarios=await API.getClienteProdutos(id);atualizarProdutosClienteContrato();}
function atualizarPlanosContrato(){
  const cp=document.getElementById("contrato-cliente-produto"),produtoId=cp.selectedOptions[0]?.dataset.produto,el=document.getElementById("contrato-plano");
  el.innerHTML=`<option value="">Selecione o plano</option>`+STATE.planos.filter(x=>x.ativo&&(!produtoId||x.produto_id===produtoId)).map(x=>`<option value="${x.id}" data-valor="${x.valor_padrao||0}">${esc(x.nome)} · ${esc(x.periodicidade)}</option>`).join("");
}
function atualizarCamposComerciaisContrato(){
  const cp=document.getElementById("contrato-cliente-produto");
  const produtoId=cp?.selectedOptions[0]?.dataset.produto || "";
  const assinatura=ehAssinatura(produtoId);
  const ass=document.getElementById("contrato-assinatura-fields"),orc=document.getElementById("contrato-orcamento-fields");
  if(ass) ass.hidden=!assinatura;
  if(orc) orc.hidden=assinatura;
  if(assinatura){
    document.getElementById("contrato-condicao").value="";
    document.getElementById("contrato-entrada").value="0";
    document.getElementById("contrato-comissao").value="0";
    document.getElementById("contrato-manutencao").value="false";
    document.getElementById("contrato-manutencao-valor").value="0";
  }
}
function recalcularComercialContrato(){
  const total=Number(document.getElementById("contrato-valor")?.value)||0;
  const entrada=Number(document.getElementById("contrato-entrada")?.value)||0;
  const pct=Number(document.getElementById("contrato-comissao")?.value)||0;
  const restante=Math.max(total-entrada,0);
  const comissao=Math.round(total*pct)/100;
  document.getElementById("contrato-restante").value=restante.toFixed(2);
  document.getElementById("contrato-comissao-valor").value=comissao.toFixed(2);
  document.getElementById("contrato-liquido").value=Math.max(total-comissao,0).toFixed(2);
}
function atualizarCampoManutencao(){
  const sim=document.getElementById("contrato-manutencao")?.value==="true";
  const wrap=document.getElementById("contrato-manutencao-valor-wrap"); if(wrap) wrap.hidden=!sim;
  if(!sim) document.getElementById("contrato-manutencao-valor").value="0";
}

document.getElementById("btn-novo-contrato")?.addEventListener("click",()=>{
  if (!STATE.clientes.length) { toast("Cadastre um cliente antes de criar um contrato.", "error"); navegarPara("clientes"); return; }
  document.getElementById("contrato-form").reset();
  document.getElementById("contrato-cliente").innerHTML=`<option value="">Selecione o cliente</option>`+STATE.clientes.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  document.getElementById("contrato-cliente-produto").innerHTML=`<option value="">Selecione o cliente primeiro</option>`;
  document.getElementById("contrato-plano").innerHTML=`<option value="">Selecione o produto primeiro</option>`;
  document.getElementById("contrato-inicio").value=new Date().toISOString().slice(0,10);
  document.getElementById("contrato-valor").value=""; document.getElementById("contrato-entrada").value="0"; document.getElementById("contrato-comissao").value="0";
  atualizarCamposComerciaisContrato(); atualizarCampoManutencao(); recalcularComercialContrato();
  contratoModal.showModal();
});
document.getElementById("contrato-fechar")?.addEventListener("click",()=>contratoModal.close());
document.getElementById("contrato-cliente")?.addEventListener("change",async e=>{if(!e.target.value){document.getElementById("contrato-cliente-produto").innerHTML=`<option value="">Selecione o cliente primeiro</option>`;return;}try{await carregarProdutosDoClienteParaContrato(e.target.value);}catch(err){toast(err.message,"error");}});
document.getElementById("contrato-cliente-produto")?.addEventListener("change",()=>{atualizarPlanosContrato();atualizarCamposComerciaisContrato();});
document.getElementById("contrato-plano")?.addEventListener("change",e=>{const v=e.target.selectedOptions[0]?.dataset.valor;if(v!=null)document.getElementById("contrato-valor").value=v;recalcularComercialContrato();});
["contrato-valor","contrato-entrada","contrato-comissao"].forEach(id=>document.getElementById(id)?.addEventListener("input",recalcularComercialContrato));
document.getElementById("contrato-manutencao")?.addEventListener("change",atualizarCampoManutencao);
document.getElementById("contrato-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const clienteProdutoId=document.getElementById("contrato-cliente-produto").value;
    if(!clienteProdutoId) throw new Error("Selecione o produto do cliente.");
    const produtoId=document.getElementById("contrato-cliente-produto").selectedOptions[0]?.dataset.produto;
    const planoId=document.getElementById("contrato-plano").value;
    if(!planoId) throw new Error("Selecione o plano/condição do produto.");
    const total=Number(document.getElementById("contrato-valor").value)||0;
    const entrada=ehAssinatura(produtoId)?0:Number(document.getElementById("contrato-entrada").value)||0;
    const pct=ehAssinatura(produtoId)?0:Number(document.getElementById("contrato-comissao").value)||0;
    const comissao=Math.round(total*pct)/100;
    const manut=ehAssinatura(produtoId)?false:document.getElementById("contrato-manutencao").value==="true";
    const payload={cliente_produto_id:clienteProdutoId,plano_id:planoId,data_inicio:document.getElementById("contrato-inicio").value,data_fim:document.getElementById("contrato-fim").value||null,proxima_renovacao:document.getElementById("contrato-renovacao").value||null,valor_contratado:total,status:document.getElementById("contrato-status").value,observacoes:document.getElementById("contrato-observacoes").value.trim()||null,condicao_pagamento:ehAssinatura(produtoId)?`${document.getElementById("contrato-plano").selectedOptions[0]?.textContent||"Assinatura"}`:document.getElementById("contrato-condicao").value.trim()||null,entrada,restante:Math.max(total-entrada,0),forma_pagamento:ehAssinatura(produtoId)?null:document.getElementById("contrato-forma").value.trim()||null,comissao_percentual:pct,comissao_valor:comissao,valor_liquido:Math.max(total-comissao,0),possui_manutencao:manut,valor_manutencao:manut?Number(document.getElementById("contrato-manutencao-valor").value)||0:0};
    const contrato=await API.createContrato(payload);
    if(ehAssinatura(produtoId) && payload.status==="ativo"){
      try{await API.gerarProximoLancamento(contrato.id);}catch(err){console.warn("Primeiro lançamento automático não gerado:",err.message);}
    } else if(payload.status==="ativo" && total>0){
      try{await API.createFinanceiro({contrato_id:contrato.id,periodo_inicio:payload.data_inicio,periodo_fim:payload.data_fim||payload.data_inicio,data_vencimento:payload.data_inicio,valor_previsto:total,valor_pago:entrada,status:entrada>0&&entrada<total?"parcial":entrada>=total?"pago":"pendente",forma_pagamento:payload.forma_pagamento,observacoes:"Lançamento inicial gerado a partir do contrato."});}catch(err){console.warn("Lançamento inicial não gerado:",err.message);}
    }
    contratoModal.close();toast("Contrato criado e conectado ao Financeiro.","success");await loadAll();
  }catch(e){toast(e.message,"error");}
});
document.getElementById("btn-novo-lancamento")?.addEventListener("click",()=>{
  if (!STATE.contratos.length) {
    toast("Cadastre um contrato antes de lançar um financeiro.", "error");
    navegarPara("contratos");
    return;
  }
  document.getElementById("financeiro-form").reset();
  preencherSelectContratoFinanceiro();
  const hoje=new Date().toISOString().slice(0,10);
  ["financeiro-inicio","financeiro-fim","financeiro-vencimento"].forEach(id=>document.getElementById(id).value=hoje);
  const contrato=STATE.contratos.find(c=>c.status==="ativo") || STATE.contratos[0];
  if (contrato) document.getElementById("financeiro-contrato").value=contrato.id;
  if (contrato?.valor_contratado != null) document.getElementById("financeiro-previsto").value=contrato.valor_contratado;
  financeiroModal.showModal();
});
document.getElementById("financeiro-fechar")?.addEventListener("click",()=>financeiroModal.close());
function atualizarStatusFinanceiroPorValores(){
  const previsto=Number(document.getElementById("financeiro-previsto")?.value)||0;
  const pago=Number(document.getElementById("financeiro-pago")?.value)||0;
  const sel=document.getElementById("financeiro-status"); if(!sel)return;
  if(pago<=0)return;
  if(previsto>0 && pago<previsto) sel.value="parcial";
  else if(previsto>0 && pago>=previsto) sel.value="pago";
}
["financeiro-previsto","financeiro-pago"].forEach(id=>document.getElementById(id)?.addEventListener("input",atualizarStatusFinanceiroPorValores));
document.getElementById("financeiro-form")?.addEventListener("submit",async e=>{e.preventDefault();try{await API.createFinanceiro({contrato_id:document.getElementById("financeiro-contrato").value,periodo_inicio:document.getElementById("financeiro-inicio").value,periodo_fim:document.getElementById("financeiro-fim").value,data_vencimento:document.getElementById("financeiro-vencimento").value,data_pagamento:document.getElementById("financeiro-data-pagamento").value||null,valor_previsto:Number(document.getElementById("financeiro-previsto").value)||0,valor_pago:Number(document.getElementById("financeiro-pago").value)||0,status:document.getElementById("financeiro-status").value,forma_pagamento:document.getElementById("financeiro-forma").value.trim()||null,observacoes:document.getElementById("financeiro-observacoes").value.trim()||null});financeiroModal.close();toast("Lançamento criado.","success");await loadAll();}catch(e){toast(e.message,"error");}});
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-fin-situacao]");
  if(b){
    try{
      const f=STATE.financeiro.find(x=>x.id===b.dataset.finSituacao); if(!f)return;
      const pagamentos=await API.getFinanceiroPagamentos(f.id);
      const body=document.getElementById("financeiro-situacao-body");
      const total=Number(f.valor_previsto||0), pago=Number(f.valor_pago||0), saldo=Math.max(total-pago,0);
      document.getElementById("financeiro-situacao-titulo").textContent=(f.contrato?.cliente_produto?.cliente?.nome||"Cliente")+" · Situação financeira";
      const historico=pagamentos.length ? pagamentos.map(p=>`<div class="crm-row"><div><div class="name">${moeda(p.valor)}</div><div class="meta">${p.data_pagamento||"—"} · ${esc(p.forma_pagamento||"Não informado")}${p.observacoes?" · "+esc(p.observacoes):""}</div></div><div class="spacer"></div><button class="btn small" data-editar-pagamento="${p.id}" data-pag-valor="${Number(p.valor)}" data-pag-forma="${esc(p.forma_pagamento||"")}" data-pag-obs="${esc(p.observacoes||"")}">Editar</button></div>`).join("") : '<div class="empty">Nenhum pagamento registrado ainda.</div>';
      body.innerHTML=`<div class="detail-grid"><div class="detail-card"><h4>Valor previsto</h4><p>${moeda(total)}</p></div><div class="detail-card"><h4>Total pago</h4><p>${moeda(pago)}</p></div><div class="detail-card"><h4>Saldo</h4><p>${moeda(saldo)}</p></div><div class="detail-card"><h4>Status</h4><p>${badgeGenerica(f.status)}</p></div></div><div class="panel-card"><h3>Registrar pagamento</h3><div class="detail-grid"><div class="field"><label>Valor pago</label><input id="sit-pag-valor" type="number" min="0.01" max="${saldo}" step="0.01"></div><div class="field"><label>Data do pagamento</label><input id="sit-pag-data" type="date" value="${new Date().toISOString().slice(0,10)}" readonly></div><div class="field"><label>Forma de pagamento</label><input id="sit-pag-forma" placeholder="PIX, cartão, boleto..."></div></div><div class="field"><label>Observações</label><textarea id="sit-pag-obs" rows="2"></textarea></div><button class="btn primary" data-registrar-pagamento="${f.id}" ${saldo<=0?"disabled":""}>Registrar pagamento</button></div><div class="panel-card"><h3>Histórico de pagamentos</h3>${historico}</div>`;
      document.getElementById("financeiro-situacao-modal").showModal();
    }catch(err){toast(err.message,"error");}
  }
  const ep=e.target.closest("[data-editar-pagamento]");
  if(ep){
    const valor=prompt("Valor do pagamento:",ep.dataset.pagValor||""); if(valor===null)return;
    const forma=prompt("Forma de pagamento:",ep.dataset.pagForma||""); if(forma===null)return;
    const obs=prompt("Observações:",ep.dataset.pagObs||""); if(obs===null)return;
    try{await API.updatePagamento(ep.dataset.editarPagamento,{valor,forma,observacoes:obs});toast("Histórico de pagamento atualizado. A data permanece hoje.","success");await loadAll();}catch(err){toast(err.message,"error");}
    return;
  }
  const r=e.target.closest("[data-registrar-pagamento]");
  if(r){
    try{
      const v=Number(document.getElementById("sit-pag-valor").value)||0;
      await API.registrarPagamento(r.dataset.registrarPagamento,{valor:v,data:document.getElementById("sit-pag-data").value,forma:document.getElementById("sit-pag-forma").value,observacoes:document.getElementById("sit-pag-obs").value});
      document.getElementById("financeiro-situacao-modal").close();toast("Pagamento registrado e saldo atualizado.","success");await loadAll();
    }catch(err){toast(err.message,"error");}
  }
  const c=e.target.closest("[data-fin-cliente]"); if(c&&c.dataset.finCliente) abrirCliente360(c.dataset.finCliente);
});
document.getElementById("financeiro-situacao-fechar")?.addEventListener("click",()=>document.getElementById("financeiro-situacao-modal").close());
["contratos-busca-produto","contratos-filtro-produto","contratos-filtro-status","financeiro-filtro-produto","financeiro-filtro-status"].forEach(id=>document.getElementById(id)?.addEventListener("change",()=>{renderContratos();renderFinanceiro();}));
["financeiro-busca-cliente"].forEach(id=>document.getElementById(id)?.addEventListener("input",renderFinanceiro));
["financeiro-data-inicio","financeiro-data-fim","financeiro-periodo-rapido"].forEach(id=>document.getElementById(id)?.addEventListener("change",renderFinanceiro));
document.getElementById("financeiro-limpar-filtros")?.addEventListener("click",()=>{["financeiro-busca-cliente","financeiro-data-inicio","financeiro-data-fim","financeiro-periodo-rapido","financeiro-filtro-produto","financeiro-filtro-status"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});renderFinanceiro();});
document.getElementById("contratos-buscar-produto")?.addEventListener("click",()=>{renderContratos();renderPlanos();});


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
  if (c.status === "encerrado") return false;
  const prazo = !c.primeira_resposta_em ? c.prazo_primeira_resposta : c.prazo_solucao;
  if (!prazo) return false;
  if (c.status === "resolvido" && c.resolvido_em) return new Date(c.resolvido_em) > new Date(prazo);
  return new Date(prazo) < new Date();
}

// A partir de quantas horas restantes o SLA passa a ficar em alerta ("expirando").
const SLA_LIMIAR_ATENCAO_HORAS = 4;

function fmtDuracao(ms) {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 1) return "menos de 1min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  if (h < 24) return restoMin ? `${h}h${restoMin}min` : `${h}h`;
  const dias = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH ? `${dias}d ${restoH}h` : `${dias}d`;
}

// Calcula o estado do SLA de um chamado a partir de prazo_primeira_resposta /
// prazo_solucao. Retorna { nivel, texto, curto }:
//  - "ok"        -> dentro do prazo, com folga
//  - "atencao"   -> ainda dentro do prazo, mas perto de vencer (< SLA_LIMIAR_ATENCAO_HORAS)
//  - "expirado"  -> prazo já vencido (ou resolvido fora do prazo)
//  - "sem_prazo" -> não há prazo configurado para esse chamado
//  - "encerrado" -> chamado encerrado; SLA não se aplica mais (o status "encerrado"
//                   já é filtrável separadamente no filtro de Status, então não é
//                   misturado aqui com "sem prazo definido" — são duas coisas diferentes)
// "texto" é a versão completa (usada no modal / tooltip); "curto" é a versão
// compacta usada na coluna da tabela, pra não estourar a largura da tela.
function slaInfo(c) {
  if (c.status === "encerrado") return { nivel: "encerrado", texto: "Encerrado", curto: "Encerrado" };

  if (c.status === "resolvido") {
    if (!c.prazo_solucao) return { nivel: "sem_prazo", texto: "Resolvido (sem prazo definido)", curto: "Sem prazo" };
    const referencia = c.resolvido_em || c.atualizado_em;
    const noPrazo = new Date(referencia) <= new Date(c.prazo_solucao);
    return noPrazo
      ? { nivel: "ok", texto: "Resolvido dentro do prazo", curto: "Dentro do prazo" }
      : { nivel: "expirado", texto: "Resolvido fora do prazo", curto: "Fora do prazo" };
  }

  const aindaSemResposta = !c.primeira_resposta_em;
  const prazo = aindaSemResposta ? c.prazo_primeira_resposta : c.prazo_solucao;
  const rotulo = aindaSemResposta ? "1ª resposta" : "solução";
  if (!prazo) return { nivel: "sem_prazo", texto: "Sem prazo definido", curto: "Sem prazo" };

  const diffMs = new Date(prazo) - new Date();
  if (diffMs <= 0) return { nivel: "expirado", texto: `Prazo de ${rotulo} expirado há ${fmtDuracao(diffMs)}`, curto: `Expirado há ${fmtDuracao(diffMs)}` };
  if (diffMs <= SLA_LIMIAR_ATENCAO_HORAS * 3600000) return { nivel: "atencao", texto: `Prazo de ${rotulo} vence em ${fmtDuracao(diffMs)}`, curto: `Vence em ${fmtDuracao(diffMs)}` };
  return { nivel: "ok", texto: `Prazo de ${rotulo} vence em ${fmtDuracao(diffMs)}`, curto: `Vence em ${fmtDuracao(diffMs)}` };
}

function slaBadgeHtml(c, opts = {}) {
  const info = slaInfo(c);
  const classe = { ok: "sla-ok", atencao: "sla-atencao", expirado: "sla-expirado", sem_prazo: "sla-sem_prazo", encerrado: "sla-encerrado" }[info.nivel];
  const rotulo = opts.compact ? info.curto : info.texto;
  return `<span class="badge ${classe}" title="${esc(info.texto)}">${esc(rotulo)}</span>`;
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
  ["ch-filtro-busca", "ch-filtro-produto", "ch-filtro-cliente", "ch-filtro-status", "ch-filtro-prioridade", "ch-filtro-sla"].forEach((id) =>
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
  const slaFiltro = document.getElementById("ch-filtro-sla")?.value || "";
  return STATE.chamados.filter((c) => {
    if (produto && c.produto !== produto) return false;
    if (status && c.status !== status) return false;
    if (prioridade && c.prioridade !== prioridade) return false;
    if (slaFiltro && slaInfo(c).nivel !== slaFiltro) return false;
    const clienteId = document.getElementById("ch-filtro-cliente")?.value || "";
    if (clienteId && c.cliente_id !== clienteId) return false;
    if (busca) {
      const alvo = `${c.numero} ${c.empresa} ${c.assunto} ${c.solicitante}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

function preencherFiltroClientesChamados() {
  const sel = document.getElementById("ch-filtro-cliente");
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos os clientes</option>' + STATE.clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  sel.value = atual;
}

function renderChamados() {
  if (!document.getElementById("chamados-tbody")) return;

  // ---- indicadores ----
  const abertos = STATE.chamados.filter((c) => c.status === "aberto").length;
  const atendimento = STATE.chamados.filter((c) => ["em_atendimento", "em_desenvolvimento", "em_analise"].includes(c.status)).length;
  const criticos = STATE.chamados.filter((c) => c.prioridade === "critica" && !["resolvido", "encerrado"].includes(c.status)).length;
  const aguardando = STATE.chamados.filter((c) => c.status === "aguardando_cliente").length;
  const resolvidos = STATE.chamados.filter((c) => c.status === "resolvido").length;
  const encerrados = STATE.chamados.filter((c) => c.status === "encerrado").length;
  const atrasados = STATE.chamados.filter(chamadoForaDoPrazo).length;
  document.getElementById("ch-stat-aberto").textContent = abertos;
  document.getElementById("ch-stat-atendimento").textContent = atendimento;
  document.getElementById("ch-stat-critico").textContent = criticos;
  document.getElementById("ch-stat-aguardando").textContent = aguardando;
  document.getElementById("ch-stat-resolvido").textContent = resolvidos;
  document.getElementById("ch-stat-encerrado").textContent = encerrados;
  document.getElementById("ch-stat-atrasado").textContent = atrasados;
  const avaliaveis = STATE.chamados.filter(c => ["resolvido","encerrado"].includes(c.status));
  const noPrazo = avaliaveis.filter(c => !chamadoForaDoPrazo(c)).length;
  document.getElementById("ch-stat-sla").textContent = avaliaveis.length ? `${Math.round(noPrazo / avaliaveis.length * 100)}%` : "—";

  // ---- por produto ----
  const porProduto = document.getElementById("chamados-por-produto");
  porProduto.innerHTML = CONFIG.PRODUTOS.map((p) => {
    const doProduto = STATE.chamados.filter((c) => c.produto === p.id);
    const abertosProduto = doProduto.filter((c) => !["resolvido", "encerrado"].includes(c.status)).length;
    return `<button type="button" class="crm-row chamado-produto-item" data-chamado-produto="${esc(p.id)}" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer">
      <div class="name">${esc(p.nome)}</div><div class="spacer"></div><div class="meta">${abertosProduto} em aberto · ${doProduto.length} no total</div>
    </button>`;
  }).join("");
  porProduto.querySelectorAll("[data-chamado-produto]").forEach(btn => btn.addEventListener("click", () => {
    const sel=document.getElementById("ch-filtro-produto");
    if(sel){ sel.value=btn.dataset.chamadoProduto; sel.dispatchEvent(new Event("input",{bubbles:true})); }
    document.getElementById("chamados-tbody")?.closest(".panel-card")?.scrollIntoView({behavior:"smooth",block:"start"});
  }));

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
        <td><span style="color:${corPrioridade(c.prioridade)};font-weight:700;text-transform:capitalize">${c.prioridade}</span></td>
        <td><select class="compact-select" data-chamado-status="${c.id}">${CONFIG.CHAMADO_STATUS.map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${labelChamadoStatus(s)}</option>`).join("")}</select></td>
        <td>${slaBadgeHtml(c, { compact: true })}</td>
        <td>${fmtDataHoraCurta(c.criado_em)}</td>
        <td style="max-width:240px"><span style="white-space:pre-wrap">${esc(c.resolucao || "—")}</span></td>
        <td style="white-space:nowrap">
          ${!["resolvido", "encerrado"].includes(c.status) ? `<button class="btn small" data-resolver-chamado="${c.id}">Resolver</button>` : ""}
          <button class="btn small" data-anotar-resolucao="${c.id}">Anotar</button>
          <button class="btn small" data-whatsapp-resolucao="${c.id}">WhatsApp</button>
          <button class="btn small" data-ver-chamado="${c.id}">Ver</button>
        </td>
      </tr>`)
    .join("");
  tbody.querySelectorAll("[data-ver-chamado]").forEach((btn) =>
    btn.addEventListener("click", () => abrirChamadoModal(btn.dataset.verChamado))
  );
  tbody.querySelectorAll("[data-chamado-status]").forEach((sel) => sel.addEventListener("change", async () => {
    const id = sel.dataset.chamadoStatus;
    const c = STATE.chamados.find((x) => x.id === id);
    try { await API.updateChamado(id, { status: sel.value }); toast("Status do chamado atualizado.", "success"); await loadAll(); }
    catch (err) { toast(err.message, "error"); if (c) sel.value = c.status; }
  }));
  tbody.querySelectorAll("[data-resolver-chamado]").forEach(btn => btn.addEventListener("click", async () => {
    const c=STATE.chamados.find(x=>x.id===btn.dataset.resolverChamado); if(!c)return;
    const resolucao=prompt(`Descreva a resolução do chamado ${c.numero} para marcá-lo como Resolvido:`, c.resolucao||"");
    if(resolucao===null)return;
    if(!resolucao.trim())return toast("Digite a resolução antes de marcar como resolvido.","error");
    try{await API.updateChamado(c.id,{status:"resolvido",resolucao:resolucao.trim()});toast("Chamado marcado como resolvido.","success");await loadAll();}
    catch(err){toast(err.message,"error");}
  }));
  tbody.querySelectorAll("[data-anotar-resolucao]").forEach(btn => btn.addEventListener("click", async () => {
    const c=STATE.chamados.find(x=>x.id===btn.dataset.anotarResolucao); if(!c)return;
    const resolucao=prompt(`Resolução do chamado ${c.numero}:`, c.resolucao||"");
    if(resolucao===null)return;
    if(!resolucao.trim())return toast("Digite a resolução do chamado.","error");
    try{await API.updateChamado(c.id,{resolucao:resolucao.trim()});toast("Resolução salva.","success");await loadAll();}
    catch(err){toast(err.message,"error");}
  }));
  tbody.querySelectorAll("[data-whatsapp-resolucao]").forEach(btn => btn.addEventListener("click", () => {
    const c=STATE.chamados.find(x=>x.id===btn.dataset.whatsappResolucao); if(!c)return;
    if(!c.resolucao?.trim()) return toast("Anote a resolução antes de enviar pelo WhatsApp.","error");
    const mensagem=`Olá, ${c.solicitante}!\n\nSobre o chamado ${c.numero} — ${c.assunto}:\n\n${c.resolucao.trim()}\n\nSe precisar de mais alguma coisa, estamos à disposição.`;
    window.open(linkWhatsapp(c.telefone,mensagem),"_blank","noopener");
  }));
}

function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value) { return value ? new Date(value).toISOString() : null; }

const novoChamadoModal = document.getElementById("novo-chamado-modal");
document.getElementById("btn-novo-chamado")?.addEventListener("click", () => {
  const cs = document.getElementById("novo-chamado-cliente");
  cs.innerHTML = '<option value="">Sem vínculo de cliente</option>' + STATE.clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  document.getElementById("novo-chamado-produto").innerHTML = STATE.produtos.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join("");
  document.getElementById("novo-chamado-prioridade").innerHTML = CONFIG.CHAMADO_PRIORIDADES.map(p => `<option value="${p}">${p === "critica" ? "Crítica" : p[0].toUpperCase()+p.slice(1)}</option>`).join("");
  novoChamadoModal.showModal();
});
document.getElementById("novo-chamado-cancelar")?.addEventListener("click", () => novoChamadoModal.close());
document.getElementById("novo-chamado-cliente")?.addEventListener("change", async e => {
  const c = STATE.clientes.find(x => x.id === e.target.value);
  if (!c) return;
  document.getElementById("novo-chamado-solicitante").value = c.responsavel || "";
  document.getElementById("novo-chamado-email").value = c.email || "";
  document.getElementById("novo-chamado-telefone").value = c.telefone || "";
  const links = STATE.clientesProdutos.filter(x => x.cliente_id === c.id && x.status !== "cancelado");
  const ps = document.getElementById("novo-chamado-produto");
  if (links.length) {
    ps.disabled = false;
    ps.innerHTML = `<option value="">Selecione o produto vinculado</option>` + links.map(x => `<option value="${esc(x.produto_id)}">${esc(STATE.produtos.find(p=>p.id===x.produto_id)?.nome || x.produto_id)}</option>`).join("");
  } else {
    ps.innerHTML = '<option value="">Nenhum produto vinculado a este cliente</option>';
    ps.disabled = true;
  }
});
document.getElementById("novo-chamado-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const clienteId = document.getElementById("novo-chamado-cliente").value || null;
  const produtoSelect = document.getElementById("novo-chamado-produto");
  const produto = produtoSelect.value;
  if (!clienteId) return toast("Selecione o cliente para vincular o chamado ao histórico correto.", "error");
  if (!produto) return toast("Selecione um produto vinculado ao cliente.", "error");
  const produtoVinculado = STATE.clientesProdutos.some(cp => cp.cliente_id === clienteId && cp.produto_id === produto && cp.status !== "cancelado");
  if (!produtoVinculado) return toast("O produto selecionado não está vinculado a este cliente.", "error");
  const payload = {
    origem_sistema: "painel", empresa: clienteId ? (STATE.clientes.find(c=>c.id===clienteId)?.nome || "") : "Atendimento YANSIX",
    solicitante: document.getElementById("novo-chamado-solicitante").value.trim(), email: document.getElementById("novo-chamado-email").value.trim(), telefone: document.getElementById("novo-chamado-telefone").value.trim(),
    produto, categoria: document.getElementById("novo-chamado-categoria").value.trim() || "Suporte", assunto: document.getElementById("novo-chamado-assunto").value.trim(), descricao: document.getElementById("novo-chamado-descricao").value.trim(),
    prioridade: document.getElementById("novo-chamado-prioridade").value, status: "aberto", responsavel: document.getElementById("novo-chamado-responsavel").value.trim() || null, cliente_id: clienteId, observacoes: document.getElementById("novo-chamado-observacoes").value.trim() || null, anexos: []
  };
  try { await API.createChamado(payload); toast("Chamado criado com sucesso.","success"); novoChamadoModal.close(); loadAll(); } catch(err) { toast(err.message,"error"); }
});

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
  const slaEl = document.getElementById("chamado-modal-sla");
  if (slaEl) slaEl.innerHTML = slaBadgeHtml(c);

  const msgChegou = `Olá, ${c.solicitante}! Recebemos o seu chamado ${c.numero} sobre "${c.assunto}" e já estamos analisando. Vamos te manter atualizado por aqui.`;
  const msgResolvido = `Olá, ${c.solicitante}! Seu chamado ${c.numero} foi resolvido. Qualquer coisa, é só chamar novamente. 🙂`;

  const anexosHtml = (c.anexos || []).length
    ? c.anexos.map((a) => `<div class="crm-row"><div class="name">${a.nome}</div><div class="spacer"></div><button class="btn small" data-baixar-anexo="${a.caminho}">Baixar</button></div>`).join("")
    : `<div class="empty">Nenhum anexo.</div>`;
  let historico = [];
  let mensagens = [];
  try { [historico, mensagens] = await Promise.all([API.getHistoricoChamado(c.id), API.getMensagensChamado(c.id)]); } catch (err) { console.warn("Histórico do chamado indisponível:", err); }
  const timeline = [...historico.map(h => ({data:h.criado_em, tipo:"Histórico", texto:`${h.campo ? h.campo + ": " : ""}${h.valor_anterior || "—"} → ${h.valor_novo || "—"}`})), ...mensagens.map(m => ({data:m.criado_em, tipo:m.tipo === "nota_interna" ? "Nota interna" : "Mensagem", texto:m.mensagem}))].sort((a,b) => new Date(a.data)-new Date(b.data));
  const timelineHtml = timeline.length ? timeline.map(e => `<div class="crm-row"><div><div class="name">${e.tipo}</div><div class="meta" style="white-space:pre-wrap">${e.texto}</div></div><div class="spacer"></div><div class="meta">${fmtDataHoraCurta(e.data)}</div></div>`).join("") : `<div class="empty">Nenhum histórico registrado.</div>`;

  document.getElementById("chamado-modal-body").innerHTML = `
    <div class="detail-grid" style="grid-template-columns:1fr 1fr;padding:0 0 8px">
      <div class="detail-card"><h4>Empresa</h4><p>${c.empresa}</p></div>
      <div class="detail-card"><h4>Solicitante</h4><p>${c.solicitante}<br><span class="mono" style="font-size:11px">${c.email} · ${c.telefone}</span></p></div>
      <div class="detail-card"><h4>Produto / categoria</h4><p>${CHAMADO_LABEL_PRODUTO[c.produto] || c.produto} · ${c.categoria}</p></div>
      <div class="detail-card"><h4>Origem</h4><p>${c.origem_sistema}</p></div>
    </div>

    <div class="field">
      <label>Cliente vinculado</label>
      <select id="ch-edit-cliente">
        <option value="">Sem vínculo de cliente</option>
        ${STATE.clientes.map(cli => `<option value="${esc(cli.id)}" ${cli.id === c.cliente_id ? "selected" : ""}>${esc(cli.nome)}</option>`).join("")}
      </select>
      <small class="help">O cliente só poderá ficar vinculado se tiver o produto ${esc(CHAMADO_LABEL_PRODUTO[c.produto] || c.produto)} cadastrado em seus produtos/serviços.</small>
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
      <div class="field"><label>Prazo 1ª resposta</label><input type="datetime-local" id="ch-edit-prazo-primeira" value="${toLocalInput(c.prazo_primeira_resposta)}"></div>
      <div class="field"><label>Prazo de solução</label><input type="datetime-local" id="ch-edit-prazo-solucao" value="${toLocalInput(c.prazo_solucao)}"></div>
    </div>

    <div class="field">
      <label>Resolução</label>
      <textarea id="ch-resolucao" rows="4" placeholder="Descreva a solução aplicada e as orientações ao cliente.">${esc(c.resolucao || "")}</textarea>
    </div>
    <div class="field">
      <label>Nota interna</label>
      <textarea id="ch-nota-interna" rows="3" placeholder="Registre uma observação da equipe sem enviar ao cliente."></textarea>
    </div>
    <div class="field" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small" id="ch-salvar-status">Salvar alterações</button>
      <button class="btn small" id="ch-adicionar-nota">Adicionar nota</button>
      <a class="btn small" target="_blank" rel="noopener" href="${linkWhatsapp(c.telefone, msgChegou)}">Avisar cliente (recebido)</a>
      <button class="btn small" id="ch-whatsapp-resolucao">WhatsApp — enviar resolução</button>
    </div>

    <div class="panel-card" style="margin-top:8px"><h3>Histórico</h3>${timelineHtml}</div>
    <div class="panel-card" style="margin-top:8px"><h3>Anexos</h3>${anexosHtml}</div>
  `;

  document.getElementById("ch-whatsapp-resolucao")?.addEventListener("click", () => {
    const resolucao=document.getElementById("ch-resolucao").value.trim();
    if(!resolucao)return toast("Preencha a resolução antes de enviar pelo WhatsApp.","error");
    const mensagem=`Olá, ${c.solicitante}!\n\nSobre o chamado ${c.numero} — ${c.assunto}:\n\n${resolucao}\n\nSe precisar de mais alguma coisa, estamos à disposição.`;
    window.open(linkWhatsapp(c.telefone,mensagem),"_blank","noopener");
  });

  document.getElementById("ch-adicionar-nota")?.addEventListener("click", async () => {
    const nota = document.getElementById("ch-nota-interna").value.trim();
    if (!nota) return toast("Digite a nota interna.", "error");
    try { await API.addMensagemChamado(c.id, { tipo: "nota_interna", autor: "Admin", mensagem: nota }); toast("Nota adicionada.", "success"); await abrirChamadoModal(c.id); } catch (err) { toast(err.message, "error"); }
  });

  document.getElementById("ch-salvar-status")?.addEventListener("click", async () => {
    try {
      const clienteIdSelecionado = document.getElementById("ch-edit-cliente").value || null;
      if (clienteIdSelecionado) {
        const vinculo = STATE.clientesProdutos.find(cp => cp.cliente_id === clienteIdSelecionado && cp.produto_id === c.produto && cp.status !== "cancelado");
        if (!vinculo) {
          throw new Error(`O cliente selecionado não possui o produto ${CHAMADO_LABEL_PRODUTO[c.produto] || c.produto} vinculado. Vá ao Cliente 360 e vincule esse produto primeiro.`);
        }
      }
      await API.updateChamado(c.id, {
        cliente_id: clienteIdSelecionado,
        status: document.getElementById("ch-edit-status").value,
        prioridade: document.getElementById("ch-edit-prioridade").value,
        responsavel: document.getElementById("ch-edit-responsavel").value.trim() || null,
        prazo_primeira_resposta: fromLocalInput(document.getElementById("ch-edit-prazo-primeira").value),
        prazo_solucao: fromLocalInput(document.getElementById("ch-edit-prazo-solucao").value),
        resolucao: document.getElementById("ch-resolucao").value.trim() || null,
        prazo_alterado_manualmente: true,
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
