-- YANSIX — Fase 13
-- Auditoria operacional + documentos privados dos contratos.
-- Aplicado no projeto Supabase do painel.

create table if not exists public.contrato_documentos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  nome_arquivo text not null,
  caminho_arquivo text not null unique,
  mime_type text,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_contrato_documentos_contrato on public.contrato_documentos(contrato_id, criado_em desc);
alter table public.contrato_documentos enable row level security;
grant select, insert, update, delete on table public.contrato_documentos to authenticated;

drop policy if exists contrato_documentos_authenticated_all on public.contrato_documentos;
create policy contrato_documentos_authenticated_all on public.contrato_documentos
for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos-documentos','contratos-documentos',false,20971520,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;

-- Arquivos: <contrato_uuid>/<arquivo>. O bucket é privado.
drop policy if exists contratos_documentos_storage_select on storage.objects;
create policy contratos_documentos_storage_select on storage.objects for select to authenticated
using (bucket_id='contratos-documentos' and exists(select 1 from public.contratos c where c.id::text=(storage.foldername(name))[1]));
drop policy if exists contratos_documentos_storage_insert on storage.objects;
create policy contratos_documentos_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='contratos-documentos' and exists(select 1 from public.contratos c where c.id::text=(storage.foldername(name))[1]));
drop policy if exists contratos_documentos_storage_update on storage.objects;
create policy contratos_documentos_storage_update on storage.objects for update to authenticated
using (bucket_id='contratos-documentos' and exists(select 1 from public.contratos c where c.id::text=(storage.foldername(name))[1]))
with check (bucket_id='contratos-documentos' and exists(select 1 from public.contratos c where c.id::text=(storage.foldername(name))[1]));
drop policy if exists contratos_documentos_storage_delete on storage.objects;
create policy contratos_documentos_storage_delete on storage.objects for delete to authenticated
using (bucket_id='contratos-documentos' and exists(select 1 from public.contratos c where c.id::text=(storage.foldername(name))[1]));

create table if not exists public.auditoria_eventos (
  id uuid primary key default gen_random_uuid(), entidade text not null, entidade_id uuid,
  acao text not null check (acao in ('INSERT','UPDATE','DELETE')), usuario_id uuid,
  dados_anteriores jsonb, dados_novos jsonb, criado_em timestamptz not null default now()
);
create index if not exists idx_auditoria_entidade on public.auditoria_eventos(entidade,entidade_id,criado_em desc);
create index if not exists idx_auditoria_usuario on public.auditoria_eventos(usuario_id,criado_em desc);
alter table public.auditoria_eventos enable row level security;
grant select on table public.auditoria_eventos to authenticated;
drop policy if exists auditoria_authenticated_select on public.auditoria_eventos;
create policy auditoria_authenticated_select on public.auditoria_eventos for select to authenticated using (true);

create or replace function public.registrar_auditoria_yansix() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.auditoria_eventos(entidade,entidade_id,acao,usuario_id,dados_anteriores,dados_novos)
  values(tg_table_name,coalesce(new.id,old.id),tg_op,auth.uid(),case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_auditoria_clientes on public.clientes;
create trigger trg_auditoria_clientes after insert or update or delete on public.clientes for each row execute function public.registrar_auditoria_yansix();
drop trigger if exists trg_auditoria_contratos on public.contratos;
create trigger trg_auditoria_contratos after insert or update or delete on public.contratos for each row execute function public.registrar_auditoria_yansix();
drop trigger if exists trg_auditoria_financeiro on public.financeiro_lancamentos;
create trigger trg_auditoria_financeiro after insert or update or delete on public.financeiro_lancamentos for each row execute function public.registrar_auditoria_yansix();
drop trigger if exists trg_auditoria_pagamentos on public.financeiro_pagamentos;
create trigger trg_auditoria_pagamentos after insert or update or delete on public.financeiro_pagamentos for each row execute function public.registrar_auditoria_yansix();
