\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co');
select 'profiles+efectivo creados' as test, (select count(*) from profiles) profiles, (select count(*) from accounts where name='Efectivo') efectivo;

-- A hace sus movimientos
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into accounts (user_id,name,type,opening_balance_cents) values (auth.uid(),'Ahorros','savings',100000);
insert into transactions (user_id,type,amount_cents,account_id) select auth.uid(),'income',500000,id from accounts where name='Efectivo' and user_id=auth.uid();
insert into transactions (user_id,type,amount_cents,account_id,to_account_id)
  select auth.uid(),'transfer',200000,e.id,a.id from accounts e, accounts a where e.name='Efectivo' and a.name='Ahorros' and e.user_id=auth.uid() and a.user_id=auth.uid();
select 'A ve sus tx' as test, count(*) from transactions;
select 'saldos A (esperado Efectivo 300000, Ahorros 300000)' as test, a.name, b.balance_cents from account_balances b join accounts a on a.id=b.account_id order by a.name;

-- B no ve nada de A
reset role; set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select 'B ve tx de A (esperado 0)' as test, count(*) from transactions;
select 'B ve cuentas de A (esperado solo su Efectivo = 1)' as test, count(*) from accounts;
insert into transactions (user_id,type,amount_cents) values ('aaaaaaaa-0000-4000-8000-000000000001','expense',1);  -- debe fallar
select 'B ve perfiles (esperado 1)' as test, count(*) from profiles;

-- escalada de privilegios
update profiles set role='super_admin' where id = auth.uid();
select 'B intentó volverse admin; rol actual (esperado user)' as test, role from profiles where id = auth.uid();
update plans set price_cents = 1;
select 'B edita planes (esperado 0 filas cambiadas)' as test, count(*) from plans where price_cents = 1;
insert into banks (name) values ('Banco falso');  -- debe fallar
update profiles set full_name = 'B editado' where id = auth.uid();
select 'B edita su nombre (esperado B editado)' as test, full_name from profiles where id = auth.uid();

-- admin real
reset role; update profiles set role='super_admin' where id='aaaaaaaa-0000-4000-8000-000000000001';
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'admin ve todos los perfiles (esperado 2)' as test, count(*) from profiles;
update plans set price_cents = 2500000 where code='pro';
select 'admin edita plan (esperado 2500000)' as test, price_cents from plans where code='pro';
reset role;
