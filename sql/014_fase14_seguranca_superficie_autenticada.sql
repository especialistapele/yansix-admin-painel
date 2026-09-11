-- YANSIX Fase 14: endurecimento da superfície de acesso.
-- Alterações já aplicadas no projeto Supabase. Mantém apenas produtos/SLA
-- e abertura pública de chamados como superfícies anônimas necessárias.

drop policy if exists "admin acesso total - clientes" on public.clientes;
create policy "authenticated acesso total - clientes" on public.clientes for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

drop policy if exists "admin acesso total - alertas" on public.alertas;
create policy "authenticated acesso total - alertas" on public.alertas for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

drop policy if exists "admin acesso total - crms" on public.crms;
create policy "authenticated acesso total - crms" on public.crms for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

drop policy if exists "admin acesso total - crm_metrica_snapshot" on public.crm_metrica_snapshot;
create policy "authenticated acesso total - crm_metrica_snapshot" on public.crm_metrica_snapshot for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

revoke all on table public.clientes from anon;
revoke all on table public.crms from anon;
revoke all on table public.crm_metrica_snapshot from anon;
revoke all on table public.alertas from anon;
revoke all on table public.cliente_produtos from anon;
revoke all on table public.contratos from anon;
revoke all on table public.planos from anon;
revoke all on table public.financeiro_lancamentos from anon;
revoke all on table public.financeiro_pagamentos from anon;
revoke all on table public.chamados from anon;
revoke all on table public.chamado_historico from anon;
revoke all on table public.chamado_mensagens from anon;
revoke all on table public.auditoria_eventos from anon;
revoke all on table public.contrato_documentos from anon;

create index if not exists idx_clientes_atualizado_em on public.clientes(atualizado_em desc);
create index if not exists idx_contratos_cliente_produto on public.contratos(cliente_produto_id);
create index if not exists idx_auditoria_entidade_criado on public.auditoria_eventos(entidade, entidade_id, criado_em desc);
