-- =========================================================
-- YANSIX — Painel Central de CRMs
-- Schema do banco de controle (rodar no Supabase DO PAINEL,
-- nunca no Supabase de um cliente).
-- Cole isso inteiro no SQL Editor do Supabase e execute.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  responsavel text,
  email text,
  status text not null default 'em_implantacao'
    check (status in ('ativo','inativo','em_implantacao')),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------
-- CRMS
-- ---------------------------------------------------------
create table if not exists public.crms (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  slug text not null unique,
  url_publica text,
  supabase_url text not null,
  supabase_anon_key text not null,
  versao text default '1.0',
  status text not null default 'em_implantacao'
    check (status in ('ativo','suspenso','em_implantacao')),
  criado_em timestamptz not null default now(),
  ultima_verificacao timestamptz,
  ultima_atividade timestamptz
);

-- ---------------------------------------------------------
-- HISTÓRICO DE MÉTRICAS (1 linha por verificação)
-- ---------------------------------------------------------
create table if not exists public.crm_metrica_snapshot (
  id uuid primary key default gen_random_uuid(),
  crm_id uuid not null references public.crms(id) on delete cascade,
  storage_usado_mb numeric default 0,
  storage_limite_mb numeric default 500,
  total_clientes int default 0,
  total_administradores int default 0,
  total_gestores int default 0,
  total_vendedores int default 0,
  status_conexao text default 'ok' check (status_conexao in ('ok','erro')),
  verificado_em timestamptz not null default now()
);

-- ---------------------------------------------------------
-- ALERTAS
-- ---------------------------------------------------------
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  crm_id uuid not null references public.crms(id) on delete cascade,
  tipo text not null check (tipo in ('storage','conexao','erro')),
  nivel text not null check (nivel in ('normal','atencao','critico','acao_necessaria')),
  mensagem text,
  criado_em timestamptz not null default now(),
  resolvido boolean not null default false
);

-- ---------------------------------------------------------
-- RLS — este é um projeto de uso único (só você).
-- A regra é simples: qualquer usuário autenticado neste
-- projeto tem acesso total. Como só existe UM usuário
-- cadastrado (você, criado manualmente em Authentication →
-- Users), isso já garante que ninguém de fora acesse nada.
-- ---------------------------------------------------------
alter table public.clientes enable row level security;
alter table public.crms enable row level security;
alter table public.crm_metrica_snapshot enable row level security;
alter table public.alertas enable row level security;

create policy "admin acesso total - clientes"
  on public.clientes for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "admin acesso total - crms"
  on public.crms for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "admin acesso total - crm_metrica_snapshot"
  on public.crm_metrica_snapshot for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "admin acesso total - alertas"
  on public.alertas for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------
-- Índices úteis
-- ---------------------------------------------------------
create index if not exists idx_crms_cliente_id on public.crms(cliente_id);
create index if not exists idx_metrica_crm_id on public.crm_metrica_snapshot(crm_id);
create index if not exists idx_metrica_verificado_em on public.crm_metrica_snapshot(verificado_em desc);
create index if not exists idx_alertas_crm_id on public.alertas(crm_id);
create index if not exists idx_alertas_resolvido on public.alertas(resolvido);
