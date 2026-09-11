-- FASE 6 — índices operacionais
create index if not exists idx_chamados_status_prioridade_prazo on public.chamados(status, prioridade, prazo_solucao);
create index if not exists idx_chamado_mensagens_chamado_criado on public.chamado_mensagens(chamado_id, criado_em);
create index if not exists idx_chamado_historico_chamado_criado on public.chamado_historico(chamado_id, criado_em);
create index if not exists idx_crms_cliente_status on public.crms(cliente_id, status);
create index if not exists idx_planos_produto_ativo on public.planos(produto_id, ativo);
