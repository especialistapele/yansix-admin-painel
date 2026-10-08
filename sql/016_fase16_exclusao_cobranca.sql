-- Fase 16: exclusão segura de cobrança e pagamentos vinculados.
-- A função exige o UID do administrador do painel e remove os pagamentos filhos antes do lançamento.
create or replace function public.excluir_cobranca_financeira(p_financeiro_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is distinct from '331ba700-d0a2-46ae-9141-28e399382147'::uuid then
    raise exception 'Acesso não autorizado.';
  end if;

  if not exists (select 1 from public.financeiro_lancamentos where id = p_financeiro_id) then
    raise exception 'Cobrança não encontrada.';
  end if;

  delete from public.financeiro_pagamentos where financeiro_id = p_financeiro_id;
  delete from public.financeiro_lancamentos where id = p_financeiro_id;
  return true;
end;
$$;

revoke execute on function public.excluir_cobranca_financeira(uuid) from public, anon;
grant execute on function public.excluir_cobranca_financeira(uuid) to authenticated;
