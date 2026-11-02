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
