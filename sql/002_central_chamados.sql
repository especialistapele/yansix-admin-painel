-- =========================================================
-- YANSIX — Painel Central
-- Módulo: CENTRAL DE CHAMADOS (suporte multi-produto)
-- Rodar no Supabase DO PAINEL (mwjkvtuvnzzyuddzjbnu.supabase.co),
-- o mesmo projeto do schema_painel_central.sql.
-- Cole isso inteiro no SQL Editor do Supabase e execute.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- PRODUTOS reconhecidos pelo ecossistema (usado em chamados,
-- e futuramente em contratos/financeiro por produto).
-- ---------------------------------------------------------
create table if not exists public.produtos_catalogo (
  id text primary key,
  nome text not null,
  ordem int not null default 0
);
insert into public.produtos_catalogo (id, nome, ordem) values
  ('crm','CRM',1),
  ('website','Website',2),
  ('landpage','Landpage',3),
  ('showroom','Showroom',4),
  ('cashback','Cashback',5),
  ('estoque','Estoque',6),
  ('branding','Branding',7),
  ('consultoria','Consultoria',8),
  ('sistema_personalizado','Sistema Personalizado',9)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- SLA por produto + prioridade (o administrador pode editar
-- os prazos aqui — etapa 8 do escopo).
-- ---------------------------------------------------------
create table if not exists public.sla_config (
  id uuid primary key default gen_random_uuid(),
  produto text not null references public.produtos_catalogo(id),
  prioridade text not null check (prioridade in ('baixa','normal','alta','critica')),
  horas_primeira_resposta numeric not null default 24,
  horas_solucao numeric,
  unique (produto, prioridade)
);

-- prazos padrão sugeridos (ela pode ajustar depois pela tela de Configurações)
insert into public.sla_config (produto, prioridade, horas_primeira_resposta, horas_solucao)
select p.id, pr.prioridade, pr.resposta, pr.solucao
from public.produtos_catalogo p
cross join (values
  ('baixa',    24, 120),
  ('normal',   12, 72),
  ('alta',     4,  24),
  ('critica',  1,  8)
) as pr(prioridade, resposta, solucao)
on conflict (produto, prioridade) do nothing;

-- ---------------------------------------------------------
-- CONTADOR DIÁRIO — usado só internamente pela função que
-- gera o número do chamado (CH-YYYYMMDD-0001). RLS habilitado
-- sem nenhuma policy: ninguém acessa via API, só a função
-- SECURITY DEFINER abaixo (que roda com privilégio de owner).
-- ---------------------------------------------------------
create table if not exists public.chamado_contador (
  dia date primary key,
  ultimo int not null default 0
);
alter table public.chamado_contador enable row level security;

-- ---------------------------------------------------------
-- CHAMADOS
-- ---------------------------------------------------------
create table if not exists public.chamados (
  id uuid primary key default gen_random_uuid(),
  numero text unique,

  -- origem
  origem_sistema text not null default 'outro' check (origem_sistema in ('crm','cashback','website','outro')),

  -- identificação
  empresa text not null,
  solicitante text not null,
  email text not null,
  telefone text not null,

  -- classificação
  produto text not null references public.produtos_catalogo(id),
  categoria text not null,
  assunto text not null,

  -- descrição do problema
  descricao text not null,
  tentando_fazer text,
  o_que_aconteceu text,
  deveria_acontecer text,
  quando_comecou text,
  frequencia text check (frequencia in ('sempre','eventualmente')),
  impede_uso boolean default false,
  pessoas_afetadas int,
  url_afetada text,
  mensagem_erro text,
  navegador text,
  dispositivo text,
  sistema_operacional text,
  passos_reproducao text,
  observacoes text,

  -- anexos: [{nome, url, tipo, tamanho}]
  anexos jsonb not null default '[]'::jsonb,

  -- urgência / atendimento
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','critica')),
  status text not null default 'aberto' check (status in
    ('aberto','em_analise','aguardando_cliente','em_atendimento','em_desenvolvimento','resolvido','encerrado')),
  responsavel text,

  prazo_primeira_resposta timestamptz,
  prazo_solucao timestamptz,
  primeira_resposta_em timestamptz,
  resolvido_em timestamptz,
  encerrado_em timestamptz,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_chamados_status on public.chamados(status);
create index if not exists idx_chamados_produto on public.chamados(produto);
create index if not exists idx_chamados_prioridade on public.chamados(prioridade);
create index if not exists idx_chamados_criado_em on public.chamados(criado_em desc);

-- ---------------------------------------------------------
-- HISTÓRICO / MENSAGENS INTERNAS do chamado
-- ---------------------------------------------------------
create table if not exists public.chamado_mensagens (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  tipo text not null check (tipo in ('nota_interna','status','whatsapp_recebido','whatsapp_resolucao')),
  autor text,
  mensagem text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_chamado_msg_chamado_id on public.chamado_mensagens(chamado_id);

-- ---------------------------------------------------------
-- FUNÇÃO: gera o número do chamado (CH-YYYYMMDD-0001) de forma
-- atômica, e calcula os prazos a partir do sla_config.
-- SECURITY DEFINER: precisa ler/escrever em chamado_contador,
-- que não tem policy nenhuma para anon/authenticated.
-- ---------------------------------------------------------
create or replace function public.gerar_numero_chamado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seq int;
  v_sla record;
begin
  if new.numero is null then
    insert into public.chamado_contador (dia, ultimo)
      values (v_dia, 1)
      on conflict (dia) do update set ultimo = chamado_contador.ultimo + 1
      returning ultimo into v_seq;
    new.numero := 'CH-' || to_char(v_dia, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
  end if;

  if new.prazo_primeira_resposta is null or new.prazo_solucao is null then
    select * into v_sla from public.sla_config
      where produto = new.produto and prioridade = new.prioridade;
    if found then
      if new.prazo_primeira_resposta is null then
        new.prazo_primeira_resposta := now() + (v_sla.horas_primeira_resposta || ' hours')::interval;
      end if;
      if new.prazo_solucao is null and v_sla.horas_solucao is not null then
        new.prazo_solucao := now() + (v_sla.horas_solucao || ' hours')::interval;
      end if;
    end if;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_gerar_numero_chamado on public.chamados;
create trigger trg_gerar_numero_chamado
  before insert on public.chamados
  for each row execute function public.gerar_numero_chamado();

create or replace function public.atualizar_timestamp_chamado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.status in ('resolvido') and old.status is distinct from new.status and new.resolvido_em is null then
    new.resolvido_em := now();
  end if;
  if new.status = 'encerrado' and old.status is distinct from new.status and new.encerrado_em is null then
    new.encerrado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_atualizar_timestamp_chamado on public.chamados;
create trigger trg_atualizar_timestamp_chamado
  before update on public.chamados
  for each row execute function public.atualizar_timestamp_chamado();

-- ---------------------------------------------------------
-- RLS
-- produtos_catalogo / sla_config: leitura pública (o form
-- precisa mostrar produto e calcular prazo prometido), edição
-- só autenticado (você).
-- chamados: qualquer pessoa (anon) pode ABRIR (insert); só
-- você (authenticated neste projeto) pode ver/gerenciar.
-- chamado_mensagens: só você.
-- ---------------------------------------------------------
alter table public.produtos_catalogo enable row level security;
alter table public.sla_config enable row level security;
alter table public.chamados enable row level security;
alter table public.chamado_mensagens enable row level security;

create policy "leitura publica - produtos_catalogo" on public.produtos_catalogo
  for select to anon, authenticated using (true);
create policy "admin gerencia produtos_catalogo" on public.produtos_catalogo
  for all to authenticated using (true) with check (true);

create policy "leitura publica - sla_config" on public.sla_config
  for select to anon, authenticated using (true);
create policy "admin gerencia sla_config" on public.sla_config
  for all to authenticated using (true) with check (true);

create policy "publico abre chamado" on public.chamados
  for insert to anon, authenticated with check (true);
create policy "admin le e gerencia chamados" on public.chamados
  for select to authenticated using (true);
create policy "admin atualiza chamados" on public.chamados
  for update to authenticated using (true) with check (true);
create policy "admin exclui chamados" on public.chamados
  for delete to authenticated using (true);

create policy "admin gerencia chamado_mensagens" on public.chamado_mensagens
  for all to authenticated using (true) with check (true);

-- Observação: como só existe UM usuário cadastrado neste projeto
-- (você, yansix.tech@gmail.com — mesmo padrão do schema_painel_central.sql),
-- "to authenticated" aqui já restringe a gestão a você.

-- =========================================================
-- ANEXOS (Storage) — bucket para os arquivos enviados junto
-- com o chamado (screenshots, documentos etc.).
-- Rode isto depois de criar o bucket "chamados-anexos" em
-- Storage → New bucket (marcar como privado, não público).
-- =========================================================
insert into storage.buckets (id, name, public)
values ('chamados-anexos', 'chamados-anexos', false)
on conflict (id) do nothing;

create policy "publico envia anexo de chamado"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'chamados-anexos');

create policy "admin le anexos de chamado"
  on storage.objects for select to authenticated
  using (bucket_id = 'chamados-anexos');

create policy "admin remove anexos de chamado"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chamados-anexos');

-- Observação de segurança: a policy de insert é ampla de propósito
-- (qualquer visitante pode abrir um chamado sem login), mas só quem
-- está autenticado neste projeto (você) consegue LISTAR ou BAIXAR os
-- arquivos depois. Quem envia um anexo não consegue ler o que outra
-- pessoa enviou, pois não há policy de select para anon.
