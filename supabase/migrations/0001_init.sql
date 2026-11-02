-- =====================================================================
-- Money — esquema inicial
-- Montos en unidades menores (centavos) como bigint. Nunca floats.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type user_role as enum ('user', 'super_admin');
create type account_type as enum ('cash', 'checking', 'savings', 'credit_card', 'wallet', 'investment', 'other');
create type tx_type as enum ('income', 'expense', 'transfer');
create type tx_status as enum ('confirmed', 'pending_review');
create type tx_source as enum ('manual', 'recurring', 'email', 'bank', 'receipt_ocr', 'statement_import', 'voice');
create type frequency as enum ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'custom');
create type plan_interval as enum ('month', 'year', 'lifetime');
create type sub_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create type pay_status as enum ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR');
create type goal_status as enum ('active', 'completed', 'paused', 'canceled');
create type debt_kind as enum ('loan', 'credit_card', 'mortgage', 'vehicle', 'personal', 'other');
create type email_provider as enum ('gmail', 'outlook', 'imap');

-- ---------- Utilidades ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Perfiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'user',
  country text not null default 'CO',
  currency text not null default 'COP',
  locale text not null default 'es-CO',
  timezone text not null default 'America/Bogota',
  month_start_day smallint not null default 1 check (month_start_day between 1 and 28),
  onboarded boolean not null default false,
  disabled boolean not null default false,
  data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin' and not disabled)
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- Catálogos administrables (super admin) ----------
create table banks (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'CO',
  name text not null,
  code text,
  logo_url text,
  sender_domains text[] not null default '{}',   -- para filtrar correos de notificación
  active boolean not null default true,
  sort_order int not null default 0,
  unique (country, name)
);

create table income_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  recurring_default boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0
);

-- Categorías de egreso. user_id null = global (gestionada por admin); si no, personal.
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  parent_id uuid references expense_categories(id) on delete set null,
  name text not null,
  icon text,
  color text,
  essential boolean not null default false,       -- necesidad vs. gusto
  active boolean not null default true,
  sort_order int not null default 0
);
create index on expense_categories (user_id);

create table subscription_platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  category_id uuid references expense_categories(id) on delete set null,
  sender_domains text[] not null default '{}',
  default_price_cents bigint,
  active boolean not null default true,
  sort_order int not null default 0
);

create table merchants (       -- comerciantes conocidos para auto-categorizar
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,   -- null = global
  name text not null,
  match_pattern text not null,
  category_id uuid references expense_categories(id) on delete set null,
  platform_id uuid references subscription_platforms(id) on delete set null
);

-- ---------- Cuentas ----------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type account_type not null default 'checking',
  bank_id uuid references banks(id) on delete set null,
  currency text not null default 'COP',
  opening_balance_cents bigint not null default 0,
  credit_limit_cents bigint,
  statement_day smallint,
  due_day smallint,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on accounts (user_id);

-- ---------- Proyectos ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  budget_cents bigint,
  start_date date,
  end_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on projects (user_id);

-- ---------- Metas de ahorro ----------
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  icon text,
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0,
  target_date date not null,
  account_id uuid references accounts(id) on delete set null,
  status goal_status not null default 'active',
  created_at timestamptz not null default now()
);
create index on savings_goals (user_id);

-- ---------- Reglas recurrentes ----------
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type tx_type not null check (type in ('income', 'expense')),
  name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  amount_is_estimate boolean not null default false,
  frequency frequency not null default 'monthly',
  interval_days int,                                -- si frequency = custom
  first_date date not null,
  next_date date not null,
  end_date date,
  due_day smallint,
  account_id uuid references accounts(id) on delete set null,
  category_id uuid references expense_categories(id) on delete set null,
  income_type_id uuid references income_types(id) on delete set null,
  platform_id uuid references subscription_platforms(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  -- Provisión: para pagos no mensuales, aparta cuota mensual (sinking fund)
  provision_enabled boolean not null default false,
  auto_register boolean not null default false,      -- crear transacción sola al vencer
  remind_days_before smallint not null default 3,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on recurring_rules (user_id, next_date);

-- ---------- Transacciones ----------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type tx_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'COP',
  occurred_on date not null default current_date,
  description text,
  merchant text,
  notes text,
  account_id uuid references accounts(id) on delete set null,
  to_account_id uuid references accounts(id) on delete set null,   -- transferencias
  category_id uuid references expense_categories(id) on delete set null,
  income_type_id uuid references income_types(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  goal_id uuid references savings_goals(id) on delete set null,
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  status tx_status not null default 'confirmed',
  source tx_source not null default 'manual',
  external_id text,                                  -- id del correo/banco para deduplicar
  dedupe_hash text,
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'transfer' or to_account_id is not null)
);
create index on transactions (user_id, occurred_on desc);
create index on transactions (user_id, status);
create unique index on transactions (user_id, external_id) where external_id is not null;
create index on transactions (user_id, dedupe_hash);
create trigger trg_tx_updated before update on transactions for each row execute function set_updated_at();

-- ---------- Presupuestos ----------
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category_id uuid references expense_categories(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  period_month date not null,                        -- primer día del mes
  unique (user_id, category_id, period_month)
);

-- ---------- Deudas ----------
create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind debt_kind not null default 'loan',
  name text not null,
  creditor text,
  bank_id uuid references banks(id) on delete set null,
  principal_cents bigint not null,
  balance_cents bigint not null,
  annual_rate numeric(7,4),                          -- EA %
  installment_cents bigint,
  total_installments int,
  paid_installments int not null default 0,
  due_day smallint,
  next_due_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on debts (user_id);

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  paid_on date not null default current_date,
  amount_cents bigint not null,
  principal_cents bigint,
  interest_cents bigint
);

-- ---------- Integraciones: correo ----------
create table email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider email_provider not null,
  email text not null,
  -- Tokens cifrados a nivel de aplicación (AES-GCM) antes de guardar
  secret_encrypted text not null,
  sync_cursor text,
  last_sync_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create table email_ingest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  connection_id uuid references email_connections(id) on delete cascade,
  message_id text not null,
  sender text,
  subject text,
  received_at timestamptz,
  outcome text not null,                              -- ignored | extracted | error
  transaction_id uuid references transactions(id) on delete set null,
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

-- ---------- Suscripciones SaaS (Wompi) ----------
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents bigint not null default 0,              -- COP en centavos
  currency text not null default 'COP',
  interval plan_interval not null default 'month',
  trial_days int not null default 0,
  limits jsonb not null default '{}'::jsonb,          -- {accounts:3, email_connections:0, ai_requests_month:50 ...}
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status sub_status not null default 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  wompi_payment_source_id text,                       -- token de fuente de pago para cobros recurrentes
  wompi_customer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (user_id);
create trigger trg_subs_updated before update on subscriptions for each row execute function set_updated_at();

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  reference text not null unique,
  wompi_transaction_id text unique,
  amount_cents bigint not null,
  currency text not null default 'COP',
  status pay_status not null default 'PENDING',
  payment_method text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments (user_id);
create trigger trg_pay_updated before update on payments for each row execute function set_updated_at();

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table profiles enable row level security;
alter table banks enable row level security;
alter table income_types enable row level security;
alter table expense_categories enable row level security;
alter table subscription_platforms enable row level security;
alter table merchants enable row level security;
alter table accounts enable row level security;
alter table projects enable row level security;
alter table savings_goals enable row level security;
alter table recurring_rules enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;
alter table email_connections enable row level security;
alter table email_ingest_log enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table app_settings enable row level security;
alter table audit_log enable row level security;

-- profiles: cada quien ve/edita el suyo (sin poder cambiar role); admin ve todos
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

-- catálogos: lectura para autenticados, escritura solo admin
create policy banks_read on banks for select to authenticated using (active or is_admin());
create policy banks_admin on banks for all using (is_admin()) with check (is_admin());
create policy income_types_read on income_types for select to authenticated using (active or is_admin());
create policy income_types_admin on income_types for all using (is_admin()) with check (is_admin());
create policy platforms_read on subscription_platforms for select to authenticated using (active or is_admin());
create policy platforms_admin on subscription_platforms for all using (is_admin()) with check (is_admin());
create policy plans_read on plans for select using (active or is_admin());
create policy plans_admin on plans for all using (is_admin()) with check (is_admin());

-- categorías y comerciantes: globales (user_id null) legibles; propias editables
create policy cats_read on expense_categories for select to authenticated using (user_id is null or user_id = auth.uid() or is_admin());
create policy cats_own_write on expense_categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cats_admin on expense_categories for all using (is_admin()) with check (is_admin());
create policy merch_read on merchants for select to authenticated using (user_id is null or user_id = auth.uid() or is_admin());
create policy merch_own_write on merchants for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy merch_admin on merchants for all using (is_admin()) with check (is_admin());

-- datos del usuario: solo el dueño
do $$
declare t text;
begin
  foreach t in array array['accounts','projects','savings_goals','recurring_rules','transactions','budgets','debts','debt_payments','email_connections','email_ingest_log']
  loop
    execute format('create policy %I_owner on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- suscripciones y pagos: el usuario solo lee los suyos (las escrituras las hace el servidor con service role)
create policy subs_read on subscriptions for select using (user_id = auth.uid() or is_admin());
create policy subs_admin on subscriptions for all using (is_admin()) with check (is_admin());
create policy pay_read on payments for select using (user_id = auth.uid() or is_admin());
create policy pay_admin on payments for all using (is_admin()) with check (is_admin());

create policy settings_admin on app_settings for all using (is_admin()) with check (is_admin());
create policy audit_admin_read on audit_log for select using (is_admin());

-- =====================================================================
-- Vistas útiles
-- =====================================================================
create or replace view account_balances with (security_invoker = true) as
select a.id as account_id, a.user_id,
  a.opening_balance_cents
  + coalesce(sum(case when t.status = 'confirmed' and t.type = 'income'  and t.account_id = a.id then t.amount_cents end), 0)
  - coalesce(sum(case when t.status = 'confirmed' and t.type = 'expense' and t.account_id = a.id then t.amount_cents end), 0)
  - coalesce(sum(case when t.status = 'confirmed' and t.type = 'transfer' and t.account_id = a.id then t.amount_cents end), 0)
  + coalesce(sum(case when t.status = 'confirmed' and t.type = 'transfer' and t.to_account_id = a.id then t.amount_cents end), 0)
  as balance_cents
from accounts a
left join transactions t on t.user_id = a.user_id and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;
