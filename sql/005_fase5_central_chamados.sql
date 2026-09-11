-- YANSIX — Fase 5: Central de Chamados
-- Índices de suporte para filtros, SLA e histórico.

create index if not exists idx_chamados_status_prioridade_prazo
  on public.chamados(status, prioridade, prazo_solucao);

create index if not exists idx_chamado_mensagens_chamado_criado
  on public.chamado_mensagens(chamado_id, criado_em);

create index if not exists idx_chamado_historico_chamado_criado
  on public.chamado_historico(chamado_id, criado_em);
