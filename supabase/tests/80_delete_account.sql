\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
-- datos de A en varias tablas
insert into transactions (user_id,type,amount_cents) values ('aaaaaaaa-0000-4000-8000-000000000001','expense',100);
insert into savings_goals (id,user_id,name,target_cents,target_date) values ('11111111-1111-4111-8111-1111111111a1','aaaaaaaa-0000-4000-8000-000000000001','Meta',100,'2027-01-01');
insert into goal_contributions (user_id,goal_id,amount_cents) values ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-1111111111a1',50);
insert into debts (user_id,name,principal_cents,balance_cents) values ('aaaaaaaa-0000-4000-8000-000000000001','Moto',100,100);
insert into shared_groups (id,user_id,name) values ('aaaa1111-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-000000000001','G');
insert into shared_members (group_id,user_id,name,is_me) values ('aaaa1111-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-000000000001','Yo',true);
insert into email_connections (user_id,provider,email,secret_encrypted) values ('aaaaaaaa-0000-4000-8000-000000000001','imap','a@x.co','v1:secreto');
insert into subscriptions (user_id,plan_id,status) select 'aaaaaaaa-0000-4000-8000-000000000001', id, 'pending' from plans where code='pro';
insert into payments (user_id,reference,amount_cents,status,raw) values ('aaaaaaaa-0000-4000-8000-000000000001','ref-A',1990000,'APPROVED','{"customer_email":"a@x.co"}');
-- datos de B (no deben tocarse)
insert into transactions (user_id,type,amount_cents) values ('bbbbbbbb-0000-4000-8000-000000000002','expense',200);
insert into payments (user_id,reference,amount_cents,status,raw) values ('bbbbbbbb-0000-4000-8000-000000000002','ref-B',1990000,'APPROVED','{"customer_email":"b@x.co"}');
select 'antes: A tiene datos (esperado > 8 tablas con filas)' as test, count(*) from (
  select 1 from accounts where user_id='aaaaaaaa-0000-4000-8000-000000000001' union all select 1 from transactions where user_id='aaaaaaaa-0000-4000-8000-000000000001' union all
  select 1 from savings_goals where user_id='aaaaaaaa-0000-4000-8000-000000000001' union all select 1 from debts where user_id='aaaaaaaa-0000-4000-8000-000000000001' union all
  select 1 from email_connections where user_id='aaaaaaaa-0000-4000-8000-000000000001' union all select 1 from subscriptions where user_id='aaaaaaaa-0000-4000-8000-000000000001') x;

-- ELIMINAR LA CUENTA de A (lo que hace auth.admin.deleteUser)
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- recorre TODAS las tablas con user_id: no debe quedar nada de A (excepto pagos, que quedan anonimizados con user_id NULL)
do $$
declare t record; n bigint; leftover text := '';
begin
  for t in select table_name from information_schema.columns where table_schema='public' and column_name='user_id' and table_name not in (select table_name from information_schema.views where table_schema='public') loop
    execute format('select count(*) from %I where user_id = %L', t.table_name, 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    if n > 0 then leftover := leftover || t.table_name || '(' || n || ') '; end if;
  end loop;
  raise notice 'TABLAS CON DATOS RESTANTES DE A: %', coalesce(nullif(leftover, ''), 'ninguna');
  execute 'select count(*) from profiles where id = ' || quote_literal('aaaaaaaa-0000-4000-8000-000000000001') into n;
  raise notice 'perfil de A restante: %', n;
end $$;
select 'pago de A conservado y anonimizado (esperado ref-A | NULL | NULL | 1990000)' as test, reference, user_id, raw, amount_cents from payments where reference = 'ref-A';
select 'B intacto (esperado 1 tx | pago con su correo)' as test, (select count(*) from transactions where user_id='bbbbbbbb-0000-4000-8000-000000000002') tx, (select raw from payments where reference='ref-B') pago_b;
