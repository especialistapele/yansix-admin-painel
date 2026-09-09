/**
 * YANSIX — Painel Central de CRMs
 * Configuração do próprio painel (banco de controle).
 *
 * IMPORTANTE: isso NUNCA deve apontar para o Supabase de um
 * cliente — só para o Supabase exclusivo do painel.
 */
const CONFIG = {
  APP_NAME: "YANSIX Painel Central",

  // Projeto Supabase do painel (banco de controle).
  SUPABASE_URL: "https://mwjkvtuvnzzyuddzjbnu.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xP4b4e02jj0xWLZup92k2w__9ed9HnU",

  SESSION_KEY: "yansix_painel_session_v1",
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  INACTIVITY_WARNING_MS: 5 * 60 * 1000,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MS: 15 * 60 * 1000,

  DB_TABLES: {
    CLIENTES: "clientes",
    CRMS: "crms",
    METRICAS: "crm_metrica_snapshot",
    ALERTAS: "alertas",
    CHAMADOS: "chamados",
    CHAMADO_MENSAGENS: "chamado_mensagens",
    SLA_CONFIG: "sla_config",
    PRODUTOS_CATALOGO: "produtos_catalogo",
  },

  STATUS_CLIENTE: ["ativo", "inativo", "em_implantacao"],
  STATUS_CRM: ["ativo", "suspenso", "em_implantacao"],

  PRODUTOS: [
    { id: "crm", nome: "CRM" },
    { id: "website", nome: "Website" },
    { id: "landpage", nome: "Landpage" },
    { id: "showroom", nome: "Showroom" },
    { id: "cashback", nome: "Cashback" },
    { id: "estoque", nome: "Estoque" },
    { id: "branding", nome: "Branding" },
    { id: "consultoria", nome: "Consultoria" },
    { id: "sistema_personalizado", nome: "Sistema Personalizado" },
  ],
  CHAMADO_STATUS: ["aberto", "em_analise", "aguardando_cliente", "em_atendimento", "em_desenvolvimento", "resolvido", "encerrado"],
  CHAMADO_STATUS_LABELS: {
    aberto: "Aberto", em_analise: "Em análise", aguardando_cliente: "Aguardando cliente",
    em_atendimento: "Em atendimento", em_desenvolvimento: "Em desenvolvimento",
    resolvido: "Resolvido", encerrado: "Encerrado",
  },
  CHAMADO_PRIORIDADES: ["baixa", "normal", "alta", "critica"],

  // Faixas de alerta de storage (%)
  ALERT_THRESHOLDS: { atencao: 70, critico: 85, acaoNecessaria: 95 },
};

if (!window.supabase?.createClient) {
  console.error("Supabase SDK não carregado.");
}
const SUPABASE_CLIENT = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
