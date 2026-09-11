create table if not exists public.financeiro_pagamentos (
  id uuid primary key default gen_random_uuid(),
  financeiro_id uuid not null references public.financeiro_lancamentos(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  data_pagamento date not null default current_date,
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_financeiro_pagamentos_financeiro_data on public.financeiro_pagamentos(financeiro_id, data_pagamento desc);
grant select, insert, update, delete on table public.financeiro_pagamentos to authenticated;
alter table public.financeiro_pagamentos enable row level security;
drop policy if exists "financeiro_pagamentos_authenticated_all" on public.financeiro_pagamentos;
create policy "financeiro_pagamentos_authenticated_all" on public.financeiro_pagamentos for all to authenticated using (true) with check (true);

create or replace function public.registrar_pagamento_financeiro(p_financeiro_id uuid, p_valor numeric, p_data date, p_forma text, p_observacoes text)
returns table(pagamento_id uuid, total_pago numeric, saldo numeric, novo_status text)
language plpgsql set search_path=public as $$
declare v_previsto numeric; v_total numeric; v_saldo numeric; v_status text; v_id uuid; v_contrato_id uuid; v_total_contrato numeric;
begin
 if p_valor is null or p_valor <= 0 then raise exception 'O valor do pagamento deve ser maior que zero.'; end if;
 select valor_previsto, contrato_id into v_previsto, v_contrato_id from financeiro_lancamentos where id=p_financeiro_id for update;
 if not found then raise exception 'Lançamento financeiro não encontrado.'; end if;
 select coalesce(sum(valor),0) into v_total from financeiro_pagamentos where financeiro_id=p_financeiro_id;
 if v_total+p_valor>v_previsto then raise exception 'O pagamento ultrapassa o valor previsto deste lançamento.'; end if;
 insert into financeiro_pagamentos(financeiro_id,valor,data_pagamento,forma_pagamento,observacoes) values(p_financeiro_id,p_valor,coalesce(p_data,current_date),nullif(trim(p_forma),''),nullif(trim(p_observacoes),'')) returning id into v_id;
 v_total:=v_total+p_valor; v_saldo:=greatest(v_previsto-v_total,0);
 v_status:=case when v_total>=v_previsto and v_previsto>0 then 'pago' when v_total>0 then 'parcial' else 'pendente' end;
 update financeiro_lancamentos set valor_pago=v_total,data_pagamento=case when v_status='pago' then coalesce(p_data,current_date) else data_pagamento end,status=v_status,atualizado_em=now() where id=p_financeiro_id;
 select valor_contratado into v_total_contrato from contratos where id=v_contrato_id;
 if v_total_contrato is not null then update contratos set restante=greatest(v_total_contrato-coalesce((select sum(fp.valor) from financeiro_pagamentos fp join financeiro_lancamentos fl on fl.id=fp.financeiro_id where fl.contrato_id=v_contrato_id),0),0),atualizado_em=now() where id=v_contrato_id; end if;
 return query select v_id,v_total,v_saldo,v_status;
end; $$;
grant execute on function public.registrar_pagamento_financeiro(uuid,numeric,date,text,text) to authenticated;
