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
    const { data: { session } } = await SUPABASE_CLIENT.auth.getSession();
    return session || null;
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
    const { error } = await SUPABASE_CLIENT.from(tableName("CLIENTES")).delete().eq("id", id);
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
