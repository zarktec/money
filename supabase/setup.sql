-- Money: instalación completa (generado por scripts/build-setup-sql.sh; no editar a mano).
-- Pégalo completo en Supabase → SQL Editor → New query → Run. Ejecútalo UNA sola vez en un proyecto nuevo.

-- ===================================================================
-- supabase/migrations/0001_init.sql
-- ===================================================================
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

-- ===================================================================
-- supabase/seed.sql
-- ===================================================================
-- Datos iniciales para Colombia (administrables luego desde el panel de super admin)

insert into banks (name, code, sender_domains, sort_order) values
 ('Bancolombia', '007', '{bancolombia.com.co,notificaciones.bancolombia.com.co}', 1),
 ('Davivienda', '051', '{davivienda.com}', 2),
 ('Banco de Bogotá', '001', '{bancodebogota.com.co}', 3),
 ('BBVA Colombia', '013', '{bbva.com.co}', 4),
 ('Banco de Occidente', '023', '{bancodeoccidente.com.co}', 5),
 ('Banco Popular', '002', '{bancopopular.com.co}', 6),
 ('AV Villas', '052', '{avvillas.com.co}', 7),
 ('Scotiabank Colpatria', '019', '{scotiabankcolpatria.com}', 8),
 ('Itaú', '006', '{itau.co}', 9),
 ('Banco Caja Social', '032', '{bancocajasocial.com}', 10),
 ('Nequi', null, '{nequi.com.co}', 11),
 ('Daviplata', null, '{daviplata.com}', 12),
 ('Lulo Bank', null, '{lulobank.com}', 13),
 ('Nu Colombia', null, '{nu.com.co}', 14),
 ('RappiPay', null, '{rappi.com}', 15)
on conflict do nothing;

insert into income_types (name, icon, recurring_default, sort_order) values
 ('Salario', 'briefcase', true, 1),
 ('Freelance / Honorarios', 'laptop', false, 2),
 ('Pensión', 'landmark', true, 3),
 ('Mesada', 'wallet', true, 4),
 ('Herencia', 'gift', false, 5),
 ('Arriendos recibidos', 'home', true, 6),
 ('Rendimientos / Inversiones', 'trending-up', false, 7),
 ('Prima / Cesantías / Bonificación', 'award', false, 8),
 ('Venta ocasional', 'tag', false, 9),
 ('Reembolso', 'undo-2', false, 10),
 ('Otros ingresos', 'plus-circle', false, 99)
on conflict do nothing;

insert into expense_categories (name, icon, color, essential, sort_order) values
 ('Vivienda (arriendo/cuota)', 'home', '#3b82f6', true, 1),
 ('Servicios públicos', 'zap', '#f59e0b', true, 2),
 ('Internet y telefonía', 'wifi', '#06b6d4', true, 3),
 ('Mercado', 'shopping-cart', '#22c55e', true, 4),
 ('Transporte y gasolina', 'car', '#64748b', true, 5),
 ('Peajes y parqueadero', 'milestone', '#78716c', false, 6),
 ('Seguros', 'shield', '#8b5cf6', true, 7),
 ('Salud', 'heart-pulse', '#ef4444', true, 8),
 ('Educación', 'graduation-cap', '#0ea5e9', true, 9),
 ('Suscripciones', 'repeat', '#ec4899', false, 10),
 ('Restaurantes y domicilios', 'utensils', '#f97316', false, 11),
 ('Bar y salidas', 'beer', '#a855f7', false, 12),
 ('Cine y entretenimiento', 'film', '#d946ef', false, 13),
 ('Ropa y calzado', 'shirt', '#14b8a6', false, 14),
 ('Hobbies', 'palette', '#84cc16', false, 15),
 ('Regalos', 'gift', '#f43f5e', false, 16),
 ('Viajes', 'plane', '#0891b2', false, 17),
 ('Finca / Asado / Recreación', 'tent', '#65a30d', false, 18),
 ('Mascotas', 'paw-print', '#d97706', false, 19),
 ('Cuidado personal', 'sparkles', '#e879f9', false, 20),
 ('Impuestos', 'file-text', '#475569', true, 21),
 ('Deudas y créditos', 'credit-card', '#dc2626', true, 22),
 ('Otros', 'more-horizontal', '#94a3b8', false, 99)
on conflict do nothing;

insert into subscription_platforms (name, sender_domains, sort_order) values
 ('Netflix', '{netflix.com}', 1),
 ('Spotify', '{spotify.com}', 2),
 ('YouTube Premium', '{youtube.com,google.com}', 3),
 ('Disney+', '{disneyplus.com}', 4),
 ('Max (HBO)', '{max.com,hbomax.com}', 5),
 ('Amazon Prime', '{amazon.com,primevideo.com}', 6),
 ('Apple (iCloud/Music/TV+)', '{apple.com}', 7),
 ('Google One', '{google.com}', 8),
 ('Microsoft 365', '{microsoft.com}', 9),
 ('ChatGPT / OpenAI', '{openai.com}', 10),
 ('Claude', '{anthropic.com}', 11),
 ('Canva', '{canva.com}', 12),
 ('Adobe', '{adobe.com}', 13),
 ('Rappi Prime', '{rappi.com}', 14),
 ('Paramount+', '{paramountplus.com}', 15),
 ('Crunchyroll', '{crunchyroll.com}', 16),
 ('Gimnasio', '{}', 90)
on conflict do nothing;

insert into plans (code, name, description, price_cents, interval, trial_days, limits, features, sort_order) values
 ('free', 'Gratis', 'Lo esencial para empezar', 0, 'month', 0,
   '{"accounts":2,"email_connections":0,"ai_requests_month":10,"projects":1,"goals":2}',
   '["Ingresos y egresos","Metas de ahorro (2)","Presupuestos básicos"]', 1),
 ('pro', 'Pro', 'Automatiza con correo e IA', 1990000, 'month', 14,
   '{"accounts":10,"email_connections":2,"ai_requests_month":300,"projects":10,"goals":20}',
   '["Todo lo del plan Gratis","Lectura de correo con IA","Foto de recibos","Deudas y proyecciones","Gastos compartidos"]', 2),
 ('pro_anual', 'Pro Anual', 'Pro con 2 meses gratis', 19900000, 'year', 14,
   '{"accounts":10,"email_connections":2,"ai_requests_month":300,"projects":10,"goals":20}',
   '["Todo lo del plan Pro","2 meses gratis"]', 3)
on conflict do nothing;

-- ===================================================================
-- supabase/migrations/0002_default_account.sql
-- ===================================================================
-- Cada usuario nuevo arranca con una cuenta "Efectivo" para poder registrar movimientos de inmediato.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  insert into accounts (user_id, name, type) values (new.id, 'Efectivo', 'cash');
  return new;
end $$;

-- ===================================================================
-- supabase/migrations/0003_planning.sql
-- ===================================================================
-- Fase 3: aportes a metas, notificaciones push y registro de recordatorios enviados.

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  goal_id uuid not null references savings_goals(id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),   -- negativo = retiro
  contributed_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index on goal_contributions (goal_id, contributed_on desc);
create index on goal_contributions (user_id, contributed_on);

-- saved_cents se mantiene solo desde aquí; el usuario no lo edita directamente.
create or replace function sync_goal_saved() returns trigger
language plpgsql security definer set search_path = public as $$
declare gid uuid := coalesce(new.goal_id, old.goal_id);
declare total bigint;
begin
  select coalesce(sum(amount_cents), 0) into total from goal_contributions where goal_id = gid;
  update savings_goals set
    saved_cents = greatest(total, 0),
    status = case
      when status in ('paused', 'canceled') then status
      when greatest(total, 0) >= target_cents then 'completed'::goal_status
      else 'active'::goal_status end
  where id = gid;
  return null;
end $$;
create trigger trg_goal_contrib_sync after insert or update or delete on goal_contributions
  for each row execute function sync_goal_saved();

-- Un aporte solo puede apuntar a una meta del mismo usuario.
create or replace function check_contribution_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from savings_goals g where g.id = new.goal_id and g.user_id = new.user_id) then
    raise exception 'La meta no pertenece al usuario';
  end if;
  return new;
end $$;
create trigger trg_goal_contrib_owner before insert or update on goal_contributions
  for each row execute function check_contribution_owner();

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);

-- Evita enviar dos veces el mismo recordatorio si el cron corre repetido.
create table reminder_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, reminder_key)
);

alter table goal_contributions enable row level security;
alter table push_subscriptions enable row level security;
alter table reminder_log enable row level security;
create policy goal_contributions_owner on goal_contributions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_owner on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- reminder_log: solo el servidor (service role) escribe; sin políticas = sin acceso para clientes.

-- El usuario no puede fijar saved_cents a mano. Un revoke por columna no basta si la tabla tiene UPDATE
-- completo (el caso por defecto en Supabase): se quita el permiso de tabla y se concede solo lo editable.
revoke update on savings_goals from authenticated;
grant update (project_id, name, icon, target_cents, target_date, account_id, status) on savings_goals to authenticated;

-- ===================================================================
-- supabase/migrations/0004_debts_networth.sql
-- ===================================================================
-- Fase 4: bienes (patrimonio) y registro atómico de pagos de deuda.

create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('property', 'vehicle', 'investment', 'savings', 'other')),
  value_cents bigint not null check (value_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assets (user_id);
create trigger trg_assets_updated before update on assets for each row execute function set_updated_at();
alter table assets enable row level security;
create policy assets_owner on assets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

/**
 * Registra un pago de deuda en UNA transacción: bloquea la deuda, valida que el saldo sea el que vio el usuario,
 * crea el egreso, el detalle del pago y actualiza saldo, cuotas pagadas y próximo vencimiento.
 * SECURITY INVOKER: las políticas RLS siguen aplicando (solo el dueño puede ver y pagar la deuda).
 */
create or replace function register_debt_payment(
  p_debt uuid, p_amount bigint, p_paid_on date, p_account uuid, p_category uuid,
  p_interest bigint, p_principal bigint, p_expected_balance bigint
) returns uuid language plpgsql as $$
declare d debts%rowtype; tx uuid; pay uuid; new_balance bigint;
begin
  select * into d from debts where id = p_debt for update;
  if not found then raise exception 'Deuda no encontrada'; end if;
  if d.balance_cents <> p_expected_balance then raise exception 'El saldo de la deuda cambió; vuelve a intentarlo'; end if;
  if p_amount <= 0 or p_interest < 0 or p_principal < 0 or p_principal > d.balance_cents or p_interest + p_principal > p_amount then
    raise exception 'Montos de pago inválidos';
  end if;
  if p_account is not null and not exists (select 1 from accounts where id = p_account) then raise exception 'Cuenta inválida'; end if;
  if p_category is not null and not exists (select 1 from expense_categories where id = p_category) then raise exception 'Categoría inválida'; end if;

  insert into transactions (user_id, type, amount_cents, occurred_on, description, account_id, category_id, source, status)
    values (d.user_id, 'expense', p_amount, p_paid_on, 'Pago ' || d.name, p_account, p_category, 'manual', 'confirmed')
    returning id into tx;
  insert into debt_payments (debt_id, user_id, transaction_id, paid_on, amount_cents, principal_cents, interest_cents)
    values (d.id, d.user_id, tx, p_paid_on, p_amount, p_principal, p_interest) returning id into pay;

  new_balance := d.balance_cents - p_principal;
  update debts set
    balance_cents = new_balance,
    paid_installments = paid_installments + case when d.installment_cents is null or p_amount >= d.installment_cents then 1 else 0 end,
    next_due_date = case when d.next_due_date is null then null else (d.next_due_date + interval '1 month')::date end,
    active = new_balance > 0
  where id = d.id;
  return pay;
end $$;

-- ===================================================================
-- supabase/migrations/0005_imports_ai.sql
-- ===================================================================
-- Fase 5: importación de extractos, lectura de recibos/texto con IA y control de uso de IA.

alter type tx_source add value if not exists 'natural_language';

-- Cada importación queda agrupada para poder deshacerla completa.
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  source text not null check (source in ('statement_csv', 'statement_pdf', 'receipt', 'text')),
  file_name text,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on import_batches (user_id, created_at desc);
alter table import_batches enable row level security;
create policy import_batches_owner on import_batches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table transactions add column import_batch_id uuid references import_batches(id) on delete set null;
create index on transactions (import_batch_id) where import_batch_id is not null;

-- Consumo de IA por usuario (para aplicar el límite mensual del plan). El servidor escribe con service role;
-- el usuario solo puede leer el suyo, nunca insertar (no puede "resetear" su consumo).
create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index on ai_usage (user_id, created_at);
alter table ai_usage enable row level security;
create policy ai_usage_read_own on ai_usage for select using (user_id = auth.uid());
revoke insert, update, delete on ai_usage from authenticated;

-- Comercios colombianos conocidos → categoría. Globales (user_id null); el super admin puede ampliarlos.
insert into merchants (name, match_pattern, category_id)
select v.name, v.pat, c.id
from (values
  ('Rappi', 'rappi', 'Restaurantes y domicilios'), ('Rappi Prime', 'rappi prime', 'Suscripciones'),
  ('iFood', 'ifood', 'Restaurantes y domicilios'), ('Uber Eats', 'uber eats', 'Restaurantes y domicilios'), ('DiDi Food', 'didi food', 'Restaurantes y domicilios'),
  ('Uber', 'uber', 'Transporte y gasolina'), ('DiDi', 'didi', 'Transporte y gasolina'), ('Cabify', 'cabify', 'Transporte y gasolina'),
  ('inDrive', 'indriver', 'Transporte y gasolina'), ('Terpel', 'terpel', 'Transporte y gasolina'), ('Primax', 'primax', 'Transporte y gasolina'),
  ('Texaco', 'texaco', 'Transporte y gasolina'), ('Biomax', 'biomax', 'Transporte y gasolina'),
  ('Éxito', 'exito', 'Mercado'), ('Jumbo', 'jumbo', 'Mercado'), ('Carulla', 'carulla', 'Mercado'), ('D1', 'd1', 'Mercado'), ('Ara', 'ara', 'Mercado'),
  ('Olímpica', 'olimpica', 'Mercado'), ('PriceSmart', 'pricesmart', 'Mercado'), ('Makro', 'makro', 'Mercado'), ('Surtimax', 'surtimax', 'Mercado'),
  ('Netflix', 'netflix', 'Suscripciones'), ('Spotify', 'spotify', 'Suscripciones'), ('Disney+', 'disney', 'Suscripciones'), ('Prime Video', 'prime video', 'Suscripciones'),
  ('YouTube Premium', 'youtube premium', 'Suscripciones'), ('Apple', 'apple com bill', 'Suscripciones'), ('Google One', 'google one', 'Suscripciones'),
  ('iCloud', 'icloud', 'Suscripciones'), ('ChatGPT', 'chatgpt', 'Suscripciones'), ('OpenAI', 'openai', 'Suscripciones'), ('Canva', 'canva', 'Suscripciones'), ('Adobe', 'adobe', 'Suscripciones'),
  ('EPM', 'epm', 'Servicios públicos'), ('Enel', 'enel', 'Servicios públicos'), ('Vanti', 'vanti', 'Servicios públicos'), ('Acueducto', 'acueducto', 'Servicios públicos'), ('Aguas', 'aguas de', 'Servicios públicos'),
  ('Claro', 'claro', 'Internet y telefonía'), ('Movistar', 'movistar', 'Internet y telefonía'), ('Tigo', 'tigo', 'Internet y telefonía'), ('WOM', 'wom', 'Internet y telefonía'), ('ETB', 'etb', 'Internet y telefonía'),
  ('Sura', 'sura', 'Salud'), ('Sanitas', 'sanitas', 'Salud'), ('Colsanitas', 'colsanitas', 'Salud'), ('Compensar', 'compensar', 'Salud'), ('Coomeva', 'coomeva', 'Salud'),
  ('Farmatodo', 'farmatodo', 'Salud'), ('Cruz Verde', 'cruz verde', 'Salud'), ('Locatel', 'locatel', 'Salud'), ('La Rebaja', 'drogas la rebaja', 'Salud'),
  ('Mapfre', 'mapfre', 'Seguros'), ('Seguros Bolívar', 'seguros bolivar', 'Seguros'), ('Allianz', 'allianz', 'Seguros'),
  ('Peaje', 'peaje', 'Peajes y parqueadero'), ('Parqueadero', 'parqueadero', 'Peajes y parqueadero'),
  ('Cine Colombia', 'cine colombia', 'Cine y entretenimiento'), ('Cinemark', 'cinemark', 'Cine y entretenimiento'), ('Procinal', 'procinal', 'Cine y entretenimiento'),
  ('Falabella', 'falabella', 'Ropa y calzado'), ('Zara', 'zara', 'Ropa y calzado'), ('Arturo Calle', 'arturo calle', 'Ropa y calzado'), ('Decathlon', 'decathlon', 'Ropa y calzado'),
  ('DIAN', 'dian', 'Impuestos')
) as v(name, pat, cat)
join expense_categories c on c.name = v.cat and c.user_id is null
where not exists (select 1 from merchants m where m.user_id is null and m.match_pattern = v.pat);

-- ===================================================================
-- supabase/migrations/0006_email.sql
-- ===================================================================
-- Fase 6: integración de correo (Gmail, Outlook, IMAP) y aprendizaje de reglas.

alter table email_connections
  add column default_account_id uuid references accounts(id) on delete set null,
  add column last_error text,
  add column last_stats jsonb;

-- Los secretos (refresh tokens, contraseñas IMAP) NUNCA deben poder leerse desde el cliente, ni siquiera cifrados.
-- Un revoke por columna no basta si la tabla tiene SELECT completo (el caso por defecto en Supabase),
-- así que se quita el permiso de tabla y se concede solo lo que la interfaz necesita ver. Todo lo demás lo hace el servidor.
revoke all on email_connections from authenticated, anon;
grant select (id, user_id, provider, email, last_sync_at, active, created_at, default_account_id, last_error, last_stats) on email_connections to authenticated;

revoke insert, update, delete on email_ingest_log from authenticated, anon;

-- Una regla propia por comercio (aprendizaje: si el usuario corrige una categoría, se recuerda).
create unique index merchants_user_pattern_idx on merchants (user_id, match_pattern) where user_id is not null;

-- ===================================================================
-- supabase/migrations/0007_shared.sql
-- ===================================================================
-- Fase 7: gastos compartidos (grupos, participantes, gastos divididos y liquidaciones).
-- Los participantes son nombres (no necesitan cuenta). Todo pertenece al usuario que lo crea.

create table shared_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table shared_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  is_me boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (group_id, user_id) references shared_groups(id, user_id) on delete cascade,
  unique (id, group_id)
);
create unique index shared_one_me_per_group on shared_members (group_id) where is_me;
create index on shared_members (group_id);

create table shared_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid not null,
  expense_date date not null default current_date,
  transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (group_id, user_id) references shared_groups(id, user_id) on delete cascade,
  foreign key (paid_by, group_id) references shared_members(id, group_id),
  unique (id, group_id)
);
create index on shared_expenses (group_id, expense_date desc);

create table shared_splits (
  expense_id uuid not null,
  member_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  share_cents bigint not null check (share_cents >= 0),
  primary key (expense_id, member_id),
  foreign key (expense_id, group_id) references shared_expenses(id, group_id) on delete cascade,
  foreign key (member_id, group_id) references shared_members(id, group_id),
  foreign key (group_id, user_id) references shared_groups(id, user_id) on delete cascade
);

-- "from_member le pagó a to_member": reduce lo que from debe.
create table shared_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null,
  from_member uuid not null,
  to_member uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  settled_on date not null default current_date,
  created_at timestamptz not null default now(),
  check (from_member <> to_member),
  foreign key (group_id, user_id) references shared_groups(id, user_id) on delete cascade,
  foreign key (from_member, group_id) references shared_members(id, group_id),
  foreign key (to_member, group_id) references shared_members(id, group_id)
);
create index on shared_settlements (group_id);

alter table shared_groups enable row level security;
alter table shared_members enable row level security;
alter table shared_expenses enable row level security;
alter table shared_splits enable row level security;
alter table shared_settlements enable row level security;
create policy shared_groups_owner on shared_groups for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shared_members_owner on shared_members for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shared_expenses_owner on shared_expenses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shared_splits_owner on shared_splits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shared_settlements_owner on shared_settlements for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Un gasto y sus partes solo se escriben por las funciones de abajo, que garantizan que las partes suman el total.
revoke insert, update, delete on shared_expenses, shared_splits from authenticated, anon;

/**
 * Crea un gasto compartido de forma atómica. p_shares = {"<member_id>": centavos}. Valida: grupo del usuario, pagador y
 * participantes del grupo, partes ≥ 0 y suma exacta = total. Si p_create_tx, registra la parte del usuario ("Yo") como gasto propio.
 */
create or replace function create_shared_expense(
  p_group uuid, p_description text, p_amount bigint, p_paid_by uuid, p_date date, p_shares jsonb,
  p_create_tx boolean default false, p_account uuid default null, p_category uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); eid uuid; total bigint := 0; r record; me uuid; me_share bigint; tx uuid;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from shared_groups where id = p_group and user_id = uid and not archived) then raise exception 'Grupo no encontrado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El valor debe ser positivo'; end if;
  if not exists (select 1 from shared_members where id = p_paid_by and group_id = p_group) then raise exception 'El pagador no pertenece al grupo'; end if;
  if jsonb_typeof(p_shares) <> 'object' or p_shares = '{}'::jsonb then raise exception 'Faltan las partes'; end if;

  for r in select key, value from jsonb_each_text(p_shares) loop
    if not exists (select 1 from shared_members where id = r.key::uuid and group_id = p_group) then raise exception 'Un participante no pertenece al grupo'; end if;
    if r.value::bigint < 0 then raise exception 'Una parte no puede ser negativa'; end if;
    total := total + r.value::bigint;
  end loop;
  if total <> p_amount then raise exception 'Las partes (%) no suman el total (%)', total, p_amount; end if;

  insert into shared_expenses (group_id, user_id, description, amount_cents, paid_by, expense_date)
    values (p_group, uid, trim(p_description), p_amount, p_paid_by, p_date) returning id into eid;
  insert into shared_splits (expense_id, member_id, group_id, user_id, share_cents)
    select eid, key::uuid, p_group, uid, value::bigint from jsonb_each_text(p_shares) where value::bigint > 0;

  if p_create_tx then
    select id into me from shared_members where group_id = p_group and is_me;
    me_share := coalesce((p_shares ->> me::text)::bigint, 0);
    if me_share > 0 then
      if p_account is not null and not exists (select 1 from accounts where id = p_account and user_id = uid) then raise exception 'Cuenta inválida'; end if;
      if p_category is not null and not exists (select 1 from expense_categories where id = p_category and (user_id is null or user_id = uid)) then raise exception 'Categoría inválida'; end if;
      insert into transactions (user_id, type, amount_cents, occurred_on, description, account_id, category_id, source, status)
        values (uid, 'expense', me_share, p_date, 'Compartido: ' || trim(p_description), p_account, p_category, 'manual', 'confirmed') returning id into tx;
      update shared_expenses set transaction_id = tx where id = eid;
    end if;
  end if;
  return eid;
end $$;

create or replace function delete_shared_expense(p_expense uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tx uuid;
begin
  select transaction_id into tx from shared_expenses where id = p_expense and user_id = uid;
  if not found then raise exception 'Gasto no encontrado'; end if;
  delete from shared_expenses where id = p_expense and user_id = uid;
  if tx is not null then delete from transactions where id = tx and user_id = uid; end if;
end $$;

revoke all on function create_shared_expense(uuid, text, bigint, uuid, date, jsonb, boolean, uuid, uuid) from public, anon;
revoke all on function delete_shared_expense(uuid) from public, anon;
grant execute on function create_shared_expense(uuid, text, bigint, uuid, date, jsonb, boolean, uuid, uuid) to authenticated;
grant execute on function delete_shared_expense(uuid) to authenticated;

-- ===================================================================
-- supabase/migrations/0008_plans_enforcement.sql
-- ===================================================================
-- Fase 8: derechos por plan hechos cumplir en la base de datos + estado "pending" para checkouts sin pagar.

-- BUG de fases anteriores: el checkout creaba la suscripción como 'trialing' sin fecha de fin ANTES del pago, y eso otorgaba
-- los límites del plan sin pagar. Un checkout sin pagar ahora es 'pending', que nunca da derechos.
alter type sub_status add value if not exists 'pending';

alter table subscriptions
  add column trial_started_at timestamptz,
  add column renewal_attempts int not null default 0,
  add column last_renewal_attempt_at timestamptz,
  add column card_brand text,
  add column card_last4 text;

-- Una sola prueba gratis por usuario y plan, aunque cancele y vuelva.
create unique index subscriptions_one_trial on subscriptions (user_id, plan_id) where trial_started_at is not null;

/**
 * Límite vigente de un usuario para una clave del plan (accounts, projects, goals…). Solo cuentan suscripciones
 * activas, en prueba o en mora (cobro rechazado dentro de un periodo ya pagado) con fecha de fin FUTURA; sin suscripción vigente aplica el plan gratis. null = sin límite.
 */
create or replace function plan_limit(p_user uuid, p_key text) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select pl.limits into v
    from subscriptions s join plans pl on pl.id = s.plan_id
   where s.user_id = p_user and s.status in ('active', 'trialing', 'past_due') and s.current_period_end is not null and s.current_period_end > now()
   order by s.created_at desc limit 1;
  if found then return (v ->> p_key)::bigint; end if;
  select limits into v from plans where code = 'free';
  return (v ->> p_key)::bigint;
end $$;

create or replace function enforce_plan_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim bigint; cur bigint;
begin
  lim := plan_limit(new.user_id, tg_argv[0]);
  if lim is null then return new; end if;
  execute format('select count(*) from %I where user_id = $1 %s', tg_table_name, coalesce(tg_argv[1], '')) into cur using new.user_id;
  if cur >= lim then raise exception 'plan_limit:%', tg_argv[0] using errcode = 'P0001'; end if;
  return new;
end $$;

create trigger trg_limit_accounts before insert on accounts for each row execute function enforce_plan_limit('accounts', 'and not archived');
create trigger trg_limit_projects before insert on projects for each row execute function enforce_plan_limit('projects', 'and not archived');
create trigger trg_limit_goals before insert on savings_goals for each row execute function enforce_plan_limit('goals', $$and status = 'active'$$);

revoke all on function plan_limit(uuid, text) from public, anon, authenticated;

-- Eliminar la cuenta borra todos los datos del usuario, EXCEPTO los pagos: son registros contables que deben conservarse.
-- Se conservan anonimizados: sin usuario y sin el evento crudo de Wompi (que trae el correo del cliente).
alter table payments alter column user_id drop not null;
alter table payments drop constraint payments_user_id_fkey;
alter table payments add constraint payments_user_id_fkey foreign key (user_id) references profiles(id) on delete set null;

create or replace function scrub_payments_on_profile_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update payments set raw = null where user_id = old.id;
  return old;
end $$;
create trigger trg_scrub_payments before delete on profiles for each row execute function scrub_payments_on_profile_delete();

-- ===================================================================
-- supabase/migrations/0009_email_notifications.sql
-- ===================================================================
-- Fase 9: el usuario decide si la app le envía avisos por correo (recordatorios, vencimiento del plan, recibos de pago).
-- Los correos de la cuenta (confirmar, recuperar contraseña) los envía Supabase Auth y no dependen de esto.
alter table profiles add column if not exists email_notifications boolean not null default true;

-- ===================================================================
-- Usuarios que se registraron ANTES de instalar este esquema
-- ===================================================================
-- El disparador que crea el perfil y la cuenta «Efectivo» solo actúa sobre usuarios nuevos. Esto los crea para quienes ya existían
-- (no hace nada en un proyecto nuevo y es seguro ejecutarlo más de una vez).
insert into profiles (id, full_name)
  select id, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) from auth.users
  on conflict (id) do nothing;
insert into accounts (user_id, name, type)
  select u.id, 'Efectivo', 'cash' from auth.users u join profiles p on p.id = u.id
  where not exists (select 1 from accounts a where a.user_id = u.id);
