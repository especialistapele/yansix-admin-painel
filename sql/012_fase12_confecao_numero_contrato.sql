-- FASE 12 — Confecção (cobrança única) + numeração obrigatória de contratos
-- O número é gerado no banco para que nenhum contrato novo possa nascer sem identificação.

create sequence if not exists public.contratos_numero_seq;

do $$
declare
  v_max bigint;
begin
  select coalesce(max((regexp_match(trim(numero), '^CTR-[0-9]{4}-([0-9]+)$'))[1]::bigint), 0)
    into v_max
  from public.contratos
  where numero is not null and trim(numero) <> ''
    and regexp_match(trim(numero), '^CTR-[0-9]{4}-([0-9]+)$') is not null;

  if v_max > 0 then
    perform setval('public.contratos_numero_seq', v_max, true);
  else
    perform setval('public.contratos_numero_seq', 1, false);
  end if;
end $$;

create or replace function public.gerar_numero_contrato()
returns text
language sql
set search_path=public
as $$
  select 'CTR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.contratos_numero_seq')::text, 4, '0');
$$;

grant usage, select on sequence public.contratos_numero_seq to authenticated;
grant execute on function public.gerar_numero_contrato() to authenticated;

create or replace function public.preencher_numero_contrato()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.gerar_numero_contrato();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preencher_numero_contrato on public.contratos;
create trigger trg_preencher_numero_contrato
before insert on public.contratos
for each row execute function public.preencher_numero_contrato();

-- Regulariza contratos antigos sem número antes de tornar a coluna obrigatória.
update public.contratos
set numero = public.gerar_numero_contrato()
where numero is null or btrim(numero) = '';

alter table public.contratos
  alter column numero set default public.gerar_numero_contrato(),
  alter column numero set not null;

create unique index if not exists ux_contratos_numero on public.contratos(numero);
