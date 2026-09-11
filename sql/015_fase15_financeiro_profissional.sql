-- YANSIX Fase 15: evolução do Financeiro sem duplicar estruturas.
-- Aproveita financeiro_lancamentos e financeiro_pagamentos existentes.

create index if not exists idx_financeiro_vencimento_status
  on public.financeiro_lancamentos (data_vencimento, status);
create index if not exists idx_financeiro_contrato_vencimento
  on public.financeiro_lancamentos (contrato_id, data_vencimento desc);
create index if not exists idx_financeiro_pagamentos_data
  on public.financeiro_pagamentos (data_pagamento desc, financeiro_id);

-- Garante que o status em atraso possa ser calculado sem criar uma nova tabela.
-- A interface deriva "em_atraso" pela data de vencimento e saldo aberto,
-- preservando o status persistido e os dados históricos existentes.
