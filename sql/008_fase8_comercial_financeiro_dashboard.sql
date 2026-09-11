-- YANSIX Central — Fase 8
-- Estrutura comercial, financeiro, dashboard e RPC público de chamados.
-- Esta migration foi aplicada no Supabase do painel.

begin;
alter table public.contratos
  add column if not exists condicao_pagamento text,
  add column if not exists entrada numeric not null default 0,
  add column if not exists restante numeric not null default 0,
  add column if not exists forma_pagamento text,
  add column if not exists comissao_percentual numeric not null default 0,
  add column if not exists comissao_valor numeric not null default 0,
  add column if not exists valor_liquido numeric,
  add column if not exists possui_manutencao boolean not null default false,
  add column if not exists valor_manutencao numeric not null default 0;
alter table public.financeiro_lancamentos drop constraint if exists financeiro_lancamentos_status_check;
alter table public.financeiro_lancamentos add constraint financeiro_lancamentos_status_check check (status = any (array['pago'::text,'pendente'::text,'em_atraso'::text,'parcial'::text,'cancelado'::text]));
create or replace function public.normalizar_contrato_comercial() returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.entrada:=greatest(coalesce(new.entrada,0),0); new.comissao_percentual:=greatest(coalesce(new.comissao_percentual,0),0); new.valor_contratado:=greatest(coalesce(new.valor_contratado,0),0); new.restante:=greatest(new.valor_contratado-new.entrada,0); new.comissao_valor:=round(new.valor_contratado*new.comissao_percentual/100,2); new.valor_liquido:=greatest(new.valor_contratado-new.comissao_valor,0); new.possui_manutencao:=coalesce(new.possui_manutencao,false); if not new.possui_manutencao then new.valor_manutencao:=0; else new.valor_manutencao:=greatest(coalesce(new.valor_manutencao,0),0); end if; return new;
end; $$;
drop trigger if exists trg_normalizar_contrato_comercial on public.contratos;
create trigger trg_normalizar_contrato_comercial before insert or update on public.contratos for each row execute function public.normalizar_contrato_comercial();
create index if not exists idx_contratos_produto_status on public.contratos(cliente_produto_id,status);
create index if not exists idx_contratos_manutencao_ativa on public.contratos(possui_manutencao) where possui_manutencao=true and status='ativo';
create index if not exists idx_planos_produto_periodicidade on public.planos(produto_id,periodicidade,ativo);
create index if not exists idx_financeiro_status_vencimento on public.financeiro_lancamentos(status,data_vencimento);
commit;

-- Dados de seed (executar somente se ainda não existirem):
insert into public.planos(produto_id,nome,periodicidade,meses_periodo,valor_padrao,ativo) values
('crm','Sistema - Assinatura Mensal','mensal',1,100,true),('crm','Sistema - Assinatura Trimestral','trimestral',3,250,true),('crm','Sistema - Assinatura Anual','anual',12,960,true),
('cashback','Sistema - Assinatura Mensal','mensal',1,80,true),('cashback','Sistema - Assinatura Trimestral','trimestral',3,210,true),('cashback','Sistema - Assinatura Anual','anual',12,720,true)
on conflict (produto_id,nome) do update set periodicidade=excluded.periodicidade,meses_periodo=excluded.meses_periodo,valor_padrao=excluded.valor_padrao,ativo=excluded.ativo,atualizado_em=now();
