-- Cada usuario nuevo arranca con una cuenta "Efectivo" para poder registrar movimientos de inmediato.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  insert into accounts (user_id, name, type) values (new.id, 'Efectivo', 'cash');
  return new;
end $$;
