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
