-- YANSIX Fase 11: exclusões, status de contratos e edição de pagamentos
-- Aplicada também no projeto Supabase principal.

create or replace function public.excluir_contrato_completo(p_contrato_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 delete from public.financeiro_pagamentos where financeiro_id in (select id from public.financeiro_lancamentos where contrato_id=p_contrato_id);
 delete from public.financeiro_lancamentos where contrato_id=p_contrato_id;
 delete from public.contratos where id=p_contrato_id; return true;
end; $$;

create or replace function public.excluir_cliente_completo(p_cliente_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_ids uuid[];
begin
 select coalesce(array_agg(id),'{}') into v_ids from public.contratos where cliente_produto_id in (select id from public.cliente_produtos where cliente_id=p_cliente_id);
 delete from public.financeiro_pagamentos where financeiro_id in (select id from public.financeiro_lancamentos where contrato_id=any(v_ids));
 delete from public.financeiro_lancamentos where contrato_id=any(v_ids); delete from public.contratos where id=any(v_ids);
 delete from public.chamado_historico where chamado_id in (select id from public.chamados where cliente_id=p_cliente_id);
 delete from public.chamado_mensagens where chamado_id in (select id from public.chamados where cliente_id=p_cliente_id);
 delete from public.chamados where cliente_id=p_cliente_id; delete from public.cliente_produtos where cliente_id=p_cliente_id; delete from public.crms where cliente_id=p_cliente_id; delete from public.clientes where id=p_cliente_id; return true;
end; $$;

create or replace function public.atualizar_pagamento_financeiro(p_pagamento_id uuid,p_valor numeric,p_forma text,p_observacoes text)
returns table(total_pago numeric,saldo numeric,novo_status text) language plpgsql security definer set search_path=public as $$
declare v_fid uuid; v_prev numeric; v_total numeric; v_saldo numeric; v_status text;
begin
 if p_valor is null or p_valor<=0 then raise exception 'O valor do pagamento deve ser maior que zero.'; end if;
 select financeiro_id into v_fid from financeiro_pagamentos where id=p_pagamento_id for update; if not found then raise exception 'Pagamento não encontrado.'; end if;
 select valor_previsto into v_prev from financeiro_lancamentos where id=v_fid for update;
 select coalesce(sum(case when id=p_pagamento_id then p_valor else valor end),0) into v_total from financeiro_pagamentos where financeiro_id=v_fid;
 if v_total>v_prev then raise exception 'Os pagamentos ultrapassam o valor previsto.'; end if;
 update financeiro_pagamentos set valor=p_valor,data_pagamento=current_date,forma_pagamento=nullif(trim(p_forma),''),observacoes=nullif(trim(p_observacoes),'') where id=p_pagamento_id;
 v_saldo:=greatest(v_prev-v_total,0); v_status:=case when v_total>=v_prev and v_prev>0 then 'pago' when v_total>0 then 'parcial' else 'pendente' end;
 update financeiro_lancamentos set valor_pago=v_total,data_pagamento=case when v_status='pago' then current_date else data_pagamento end,status=v_status,atualizado_em=now() where id=v_fid;
 return query select v_total,v_saldo,v_status;
end; $$;

create or replace function public.forcar_data_pagamento_hoje() returns trigger language plpgsql set search_path=public as $$ begin new.data_pagamento:=current_date; return new; end; $$;
drop trigger if exists trg_pagamento_data_hoje on public.financeiro_pagamentos;
create trigger trg_pagamento_data_hoje before insert or update on public.financeiro_pagamentos for each row execute function public.forcar_data_pagamento_hoje();

-- Evita gerar duas cobranças para o mesmo contrato enquanto a cobrança atual ainda está vigente.
create or replace function public.gerar_proximo_lancamento_financeiro(p_contrato_id uuid) returns uuid language plpgsql set search_path=public as $$
declare v_contrato public.contratos%rowtype; v_plano public.planos%rowtype; v_ultimo public.financeiro_lancamentos%rowtype; v_inicio date; v_fim date; v_venc date; v_valor numeric(14,2); v_id uuid;
begin
 select * into v_contrato from public.contratos where id=p_contrato_id; if not found then raise exception 'Contrato não encontrado'; end if;
 if v_contrato.status<>'ativo' then raise exception 'Somente contratos ativos podem gerar lançamentos'; end if;
 select * into v_plano from public.planos where id=v_contrato.plano_id; if not found then raise exception 'Plano não encontrado'; end if;
 select * into v_ultimo from public.financeiro_lancamentos where contrato_id=p_contrato_id and status<>'cancelado' order by periodo_fim desc nulls last,data_vencimento desc nulls last,criado_em desc limit 1;
 if v_ultimo.id is not null and current_date<=coalesce(v_ultimo.periodo_fim,v_ultimo.data_vencimento) then raise exception 'Já existe uma cobrança vigente para este contrato. Não é possível gerar outra agora.'; end if;
 if v_plano.periodicidade='unico' and v_ultimo.id is not null then raise exception 'Este contrato já possui uma cobrança. Exclua a cobrança existente antes de gerar outra.'; end if;
 v_inicio:=case when v_ultimo.id is null then v_contrato.data_inicio else v_ultimo.periodo_fim+1 end;
 if v_plano.periodicidade='unico' then v_fim:=v_inicio; else v_fim:=(v_inicio+make_interval(months=>greatest(v_plano.meses_periodo,1)))::date-1; end if;
 v_venc:=case when v_contrato.proxima_renovacao is not null and v_ultimo.id is null then v_contrato.proxima_renovacao else v_inicio end; v_valor:=coalesce(v_contrato.valor_contratado,v_plano.valor_padrao,0);
 insert into public.financeiro_lancamentos(contrato_id,periodo_inicio,periodo_fim,data_vencimento,valor_previsto,status,observacoes) values(p_contrato_id,v_inicio,v_fim,v_venc,v_valor,'pendente','Lançamento gerado automaticamente conforme periodicidade do plano.') returning id into v_id; return v_id;
end; $$;

revoke execute on function public.excluir_contrato_completo(uuid) from public; grant execute on function public.excluir_contrato_completo(uuid) to authenticated;
revoke execute on function public.excluir_cliente_completo(uuid) from public; grant execute on function public.excluir_cliente_completo(uuid) to authenticated;
revoke execute on function public.atualizar_pagamento_financeiro(uuid,numeric,text,text) from public; grant execute on function public.atualizar_pagamento_financeiro(uuid,numeric,text,text) to authenticated;
grant execute on function public.gerar_proximo_lancamento_financeiro(uuid) to authenticated;
