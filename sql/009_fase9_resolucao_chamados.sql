-- Fase 9: resolução dos chamados
alter table public.chamados add column if not exists resolucao text;
grant select, insert, update, delete on table public.chamados to authenticated;
create index if not exists idx_chamados_resolucao on public.chamados(id) where resolucao is not null;
