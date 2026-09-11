-- Fase 7: vínculo seguro do formulário público com cliente + produto
-- O formulário público usa esta função para localizar um cliente existente
-- por e-mail/telefone e validar se o produto escolhido está vinculado a ele.

create or replace function public.resolver_cliente_para_chamado(
  p_email text,
  p_telefone text,
  p_produto_id text
)
returns table(cliente_id uuid, produto_vinculado boolean)
language sql
security definer
set search_path = public
as $$
  with candidato as (
    select c.id
    from public.clientes c
    where
      (
        nullif(trim(p_email), '') is not null
        and nullif(trim(c.email), '') is not null
        and lower(trim(c.email)) = lower(trim(p_email))
      )
      or
      (
        nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '') is not null
        and nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '') is not null
        and regexp_replace(c.telefone, '\D', '', 'g') = regexp_replace(p_telefone, '\D', '', 'g')
      )
    order by
      case
        when nullif(trim(p_email), '') is not null
         and lower(trim(c.email)) = lower(trim(p_email)) then 0
        else 1
      end,
      c.criado_em desc
    limit 1
  )
  select
    candidato.id,
    exists (
      select 1
      from public.cliente_produtos cp
      where cp.cliente_id = candidato.id
        and cp.produto_id = p_produto_id
        and cp.status <> 'cancelado'
    )
  from candidato;
$$;

revoke all on function public.resolver_cliente_para_chamado(text, text, text) from public;
grant execute on function public.resolver_cliente_para_chamado(text, text, text) to anon, authenticated;
