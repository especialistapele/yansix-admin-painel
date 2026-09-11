/**
 * YANSIX — Painel Central de CRMs
 * Camada de dados. Fala só com o Supabase DO PAINEL.
 */

function tableName(key) {
  const t = CONFIG.DB_TABLES[key];
  if (!t) throw new Error(`Tabela não configurada: ${key}`);
  return t;
}

let API_TOKEN = localStorage.getItem("yansix_painel_api_token_v1") || "";
function setApiToken(token) {
  API_TOKEN = token || "";
  if (API_TOKEN) localStorage.setItem("yansix_painel_api_token_v1", API_TOKEN);
  else localStorage.removeItem("yansix_painel_api_token_v1");
}

const API = {
  async login(email, password) {
    const { data, error } = await SUPABASE_CLIENT.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || "E-mail ou senha inválidos.");
    const token = data.session?.access_token || "";
    setApiToken(token);
    return { token, user: data.user, expiresIn: data.session?.expires_in || 3600 };
  },

  async logout() {
    await SUPABASE_CLIENT.auth.signOut();
    setApiToken("");
  },

  async restoreSession() {
    // getUser() valida a identidade no servidor; não usamos o objeto local de sessão
    // como fonte de autorização.
    const { data: { user }, error } = await SUPABASE_CLIENT.auth.getUser();
    if (error) return null;
    return user || null;
  },

  // ---------- CLIENTES ----------
  async getClientes() {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CLIENTES"))
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createCliente(payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CLIENTES"))
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateCliente(id, payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CLIENTES"))
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeCliente(id) {
    const { error } = await SUPABASE_CLIENT.rpc("excluir_cliente_completo", { p_cliente_id: id });
    if (error) throw new Error(error.message);
    return true;
  },

  // ---------- CRMS ----------
  async getCrms() {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CRMS"))
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createCrm(payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CRMS"))
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateCrm(id, payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CRMS"))
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeCrm(id) {
    const { error } = await SUPABASE_CLIENT.from(tableName("CRMS")).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  // ---------- MÉTRICAS ----------
  async getMetricasByCrm(crmId) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("METRICAS"))
      .select("*")
      .eq("crm_id", crmId)
      .order("verificado_em", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data || [];
  },
  async getUltimaMetricaPorCrm() {
    // busca todas e reduz no cliente (volume baixo, ok pra esse painel)
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("METRICAS"))
      .select("*")
      .order("verificado_em", { ascending: false });
    if (error) throw new Error(error.message);
    const porCrm = {};
    for (const m of data || []) {
      if (!porCrm[m.crm_id]) porCrm[m.crm_id] = m;
    }
    return porCrm;
  },
  async registrarMetrica(payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("METRICAS"))
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await SUPABASE_CLIENT
      .from(tableName("CRMS"))
      .update({ ultima_verificacao: payload.verificado_em || new Date().toISOString() })
      .eq("id", payload.crm_id);
    return data;
  },

  // ---------- ALERTAS ----------
  async getAlertas({ apenasAbertos = true } = {}) {
    let query = SUPABASE_CLIENT
      .from(tableName("ALERTAS"))
      .select("*")
      .order("criado_em", { ascending: false });
    if (apenasAbertos) query = query.eq("resolvido", false);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },
  async criarAlerta(payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("ALERTAS"))
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async resolverAlerta(id) {
    const { error } = await SUPABASE_CLIENT
      .from(tableName("ALERTAS"))
      .update({ resolvido: true })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  // ---------- CHAMADOS ----------
  async getChamados() {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CHAMADOS"))
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createChamado(payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CHAMADOS"))
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async getChamado(id) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CHAMADOS")).select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateChamado(id, payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CHAMADOS"))
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeChamado(id) {
    const { error } = await SUPABASE_CLIENT.from(tableName("CHAMADOS")).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
  async getMensagensChamado(chamadoId) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CHAMADO_MENSAGENS"))
      .select("*")
      .eq("chamado_id", chamadoId)
      .order("criado_em", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async addMensagemChamado(chamadoId, payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CHAMADO_MENSAGENS"))
      .insert({ chamado_id: chamadoId, ...payload })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async getHistoricoChamado(chamadoId) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("CHAMADO_HISTORICO"))
      .select("*")
      .eq("chamado_id", chamadoId)
      .order("criado_em", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },


  // ---------- PRODUTOS / PLANOS / CONTRATOS / FINANCEIRO ----------
  async getProdutos() {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("PRODUTOS_CATALOGO")).select("*").order("ordem");
    if (error) throw new Error(error.message);
    return data || [];
  },
  async getPlanos({ produtoId = null, apenasAtivos = false } = {}) {
    let q = SUPABASE_CLIENT.from(tableName("PLANOS")).select("*, produto:produtos_catalogo(id,nome)").order("criado_em", { ascending: false });
    if (produtoId) q = q.eq("produto_id", produtoId);
    if (apenasAtivos) q = q.eq("ativo", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createPlano(payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("PLANOS")).insert(payload).select("*, produto:produtos_catalogo(id,nome)").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updatePlano(id, payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("PLANOS")).update(payload).eq("id", id).select("*, produto:produtos_catalogo(id,nome)").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateCrm(id, payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CRMS")).update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },

  async getCliente360(clienteId) {
    const id = String(clienteId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("ID do cliente inválido para o Cliente 360.");
    }
    const [clienteRes, produtosRes, crmsRes, chamadosRes, contratosRes] = await Promise.all([
      SUPABASE_CLIENT.from(tableName("CLIENTES")).select("*").eq("id", id).single(),
      SUPABASE_CLIENT.from(tableName("CLIENTE_PRODUTOS")).select("*, produto:produtos_catalogo(id,nome)").eq("cliente_id", id).order("criado_em", { ascending: false }),
      SUPABASE_CLIENT.from(tableName("CRMS")).select("*").eq("cliente_id", clienteId).order("criado_em", { ascending: false }),
      SUPABASE_CLIENT.from(tableName("CHAMADOS")).select("*").eq("cliente_id", id).order("criado_em", { ascending: false }),
      SUPABASE_CLIENT.from(tableName("CONTRATOS")).select("*, cliente_produto:cliente_produtos!inner(id,cliente_id,produto_id,status,produto:produtos_catalogo(id,nome)), plano:planos(id,nome,periodicidade,meses_periodo,valor_padrao)" ).eq("cliente_produto.cliente_id", id).order("criado_em", { ascending: false }),
    ]);
    for (const r of [clienteRes, produtosRes, crmsRes, chamadosRes, contratosRes]) if (r.error) throw new Error(r.error.message);
    const contratos=contratosRes.data||[];
    let financeiro=[];
    if (contratos.length) {
      const ids=contratos.map(x=>x.id);
      const r=await SUPABASE_CLIENT.from(tableName("FINANCEIRO")).select("*, contrato:contratos(id,numero)").in("contrato_id",ids).order("data_vencimento",{ascending:false});
      if(r.error) throw new Error(r.error.message); financeiro=r.data||[];
    }
    return {cliente:clienteRes.data,produtos:produtosRes.data||[],crms:crmsRes.data||[],chamados:chamadosRes.data||[],contratos,financeiro};
  },
  async getClienteProdutos(clienteId) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CLIENTE_PRODUTOS"))
      .select("*, produto:produtos_catalogo(id,nome)")
      .eq("cliente_id", clienteId).order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createClienteProduto(payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CLIENTE_PRODUTOS"))
      .insert(payload).select("*, produto:produtos_catalogo(id,nome)").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeClienteProduto(id) {
    const { error } = await SUPABASE_CLIENT.from(tableName("CLIENTE_PRODUTOS")).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
  async getContratos({ status = null, produtoId = null } = {}) {
    let q = SUPABASE_CLIENT.from(tableName("CONTRATOS"))
      .select("*, cliente:cliente_produtos!inner(id,cliente_id,produto_id,status,produto:produtos_catalogo(id,nome), cliente:clientes(id,nome)), plano:planos(id,nome,periodicidade,meses_periodo,valor_padrao)")
      .order("criado_em", { ascending: false });
    if (status) q = q.eq("status", status);
    if (produtoId) q = q.eq("cliente.produto_id", produtoId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createContrato(payload) {
    const dados = { ...payload };
    if (!dados.numero || !String(dados.numero).trim()) delete dados.numero;
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CONTRATOS")).insert(dados)
      .select("*, cliente_produto:cliente_produtos(id,cliente_id,produto_id), plano:planos(id,nome,periodicidade)").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateContrato(id, payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CONTRATOS")).update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async getContratoDocumento(contratoId) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CONTRATO_DOCUMENTOS"))
      .select("*").eq("contrato_id", contratoId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },
  async uploadContratoDocumento(contratoId, file) {
    if (!file) throw new Error("Selecione um arquivo.");
    const permitidos = ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","image/jpeg","image/png"];
    if (!permitidos.includes(file.type)) throw new Error("Formato não permitido. Use PDF, DOC, DOCX, JPG ou PNG.");
    if (file.size > 20 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 20 MB.");
    const antigo = await this.getContratoDocumento(contratoId);
    const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "contrato";
    const path = `${contratoId}/${crypto.randomUUID()}-${safeName}`;
    const { error: upError } = await SUPABASE_CLIENT.storage.from("contratos-documentos").upload(path, file, { contentType: file.type, upsert: false });
    if (upError) throw new Error(upError.message);
    const { data, error } = await SUPABASE_CLIENT.from(tableName("CONTRATO_DOCUMENTOS")).insert({
      contrato_id: contratoId, nome_arquivo: file.name, caminho_arquivo: path, mime_type: file.type || null, tamanho_bytes: file.size
    }).select("*").single();
    if (error) { await SUPABASE_CLIENT.storage.from("contratos-documentos").remove([path]); throw new Error(error.message); }
    if (antigo) {
      await SUPABASE_CLIENT.storage.from("contratos-documentos").remove([antigo.caminho_arquivo]);
      await SUPABASE_CLIENT.from(tableName("CONTRATO_DOCUMENTOS")).delete().eq("id", antigo.id);
    }
    return data;
  },
  async downloadContratoDocumento(documento) {
    if (!documento?.caminho_arquivo) throw new Error("Documento não encontrado.");
    const { data, error } = await SUPABASE_CLIENT.storage.from("contratos-documentos").createSignedUrl(documento.caminho_arquivo, 300, { download: documento.nome_arquivo || true });
    if (error) throw new Error(error.message);
    return data?.signedUrl;
  },
  async removeContratoDocumento(documento) {
    if (!documento) return true;
    const { error: storageError } = await SUPABASE_CLIENT.storage.from("contratos-documentos").remove([documento.caminho_arquivo]);
    if (storageError) throw new Error(storageError.message);
    const { error } = await SUPABASE_CLIENT.from(tableName("CONTRATO_DOCUMENTOS")).delete().eq("id", documento.id);
    if (error) throw new Error(error.message);
    return true;
  },
  async getAuditoria({ entidade = null, entidadeId = null, limit = 100 } = {}) {
    let q = SUPABASE_CLIENT.from(tableName("AUDITORIA")).select("*").order("criado_em", { ascending: false }).limit(limit);
    if (entidade) q = q.eq("entidade", entidade);
    if (entidadeId) q = q.eq("entidade_id", entidadeId);
    const { data, error } = await q; if (error) throw new Error(error.message); return data || [];
  },
  async removeContrato(id) {
    const { error } = await SUPABASE_CLIENT.rpc("excluir_contrato_completo", { p_contrato_id: id });
    if (error) throw new Error(error.message);
    return true;
  },
  async getFinanceiro({ produtoId = null, status = null } = {}) {
    let q = SUPABASE_CLIENT.from(tableName("FINANCEIRO"))
      .select("*, contrato:contratos(id,numero,valor_contratado,cliente_produto:cliente_produtos!inner(cliente_id,produto_id,produto:produtos_catalogo(id,nome),cliente:clientes(id,nome)),plano:planos(id,nome,periodicidade))")
      .order("data_vencimento", { ascending: false });
    if (status) q = q.eq("status", status);
    if (produtoId) q = q.eq("contrato.cliente_produto.produto_id", produtoId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createFinanceiro(payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("FINANCEIRO")).insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateFinanceiro(id, payload) {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("FINANCEIRO")).update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async getFinanceiroPagamentos(financeiroId) {
    const { data, error } = await SUPABASE_CLIENT.from("financeiro_pagamentos").select("*").eq("financeiro_id", financeiroId).order("data_pagamento", { ascending:false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async registrarPagamento(financeiroId, payload) {
    const { data, error } = await SUPABASE_CLIENT.rpc("registrar_pagamento_financeiro", { p_financeiro_id: financeiroId, p_valor: Number(payload.valor), p_data: null, p_forma: payload.forma || null, p_observacoes: payload.observacoes || null });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  },
  async updatePagamento(id, payload) {
    const { data, error } = await SUPABASE_CLIENT.rpc("atualizar_pagamento_financeiro", { p_pagamento_id: id, p_valor: Number(payload.valor), p_forma: payload.forma || null, p_observacoes: payload.observacoes || null });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  },
  async removeFinanceiro(id) {
    const { error } = await SUPABASE_CLIENT.from(tableName("FINANCEIRO")).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
  async gerarProximoLancamento(contratoId) {
    const { data, error } = await SUPABASE_CLIENT.rpc("gerar_proximo_lancamento_financeiro", { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
    return data;
  },

  async getAnexoUrl(caminho) {
    const { data, error } = await SUPABASE_CLIENT.storage
      .from("chamados-anexos")
      .createSignedUrl(caminho, 60 * 10); // 10 minutos
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  async getSlaConfig() {
    const { data, error } = await SUPABASE_CLIENT.from(tableName("SLA_CONFIG")).select("*");
    if (error) throw new Error(error.message);
    return data || [];
  },
  async updateSlaConfig(id, payload) {
    const { data, error } = await SUPABASE_CLIENT
      .from(tableName("SLA_CONFIG"))
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
