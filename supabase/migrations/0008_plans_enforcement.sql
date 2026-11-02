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
