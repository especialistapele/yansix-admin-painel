-- Watchdog YANSIX: histórico de execuções.
-- Aplicar somente no projeto Supabase central YansixPainelCRM.
create table if not exists public.watchdog_runs (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null unique,
  started_at timestamptz,
  generated_at timestamptz not null default now(),
  total integer not null default 0 check (total >= 0),
  counts jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_watchdog_runs_created_at
  on public.watchdog_runs (created_at desc);
alter table public.watchdog_runs enable row level security;
grant select on public.watchdog_runs to authenticated;
drop policy if exists "watchdog runs readable by authenticated operators" on public.watchdog_runs;
create policy "watchdog runs readable by authenticated operators"
  on public.watchdog_runs for select to authenticated
  using (auth.uid() is not null);
comment on table public.watchdog_runs is
  'Histórico resumido do Watchdog YANSIX; gravação exclusiva pelo token de serviço em GitHub Actions.';
