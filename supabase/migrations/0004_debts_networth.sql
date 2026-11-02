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
