\set ON_ERROR_STOP 0
-- Usuarios A y B (si ya existen por la prueba anterior, se ignoran los duplicados)
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
reset role; set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into savings_goals (id,user_id,name,target_cents,target_date) values ('11111111-1111-4111-8111-111111111111', auth.uid(),'Viaje',1000000,'2027-06-30');
insert into goal_contributions (user_id,goal_id,amount_cents) values (auth.uid(),'11111111-1111-4111-8111-111111111111',300000);
insert into goal_contributions (user_id,goal_id,amount_cents) values (auth.uid(),'11111111-1111-4111-8111-111111111111',200000);
select 'saved se calcula por trigger (esperado 500000 / active)' as test, saved_cents, status from savings_goals where id='11111111-1111-4111-8111-111111111111';
insert into goal_contributions (user_id,goal_id,amount_cents) values (auth.uid(),'11111111-1111-4111-8111-111111111111',-100000);
select 'retiro baja el saldo (esperado 400000)' as test, saved_cents from savings_goals where id='11111111-1111-4111-8111-111111111111';
insert into goal_contributions (user_id,goal_id,amount_cents) values (auth.uid(),'11111111-1111-4111-8111-111111111111',600000);
select 'al llegar a la meta se completa (esperado 1000000 / completed)' as test, saved_cents, status from savings_goals where id='11111111-1111-4111-8111-111111111111';
delete from goal_contributions where amount_cents = 600000;
select 'borrar aporte reabre la meta (esperado 400000 / active)' as test, saved_cents, status from savings_goals where id='11111111-1111-4111-8111-111111111111';
-- el usuario no puede falsear el ahorro
update savings_goals set saved_cents = 999999999 where id='11111111-1111-4111-8111-111111111111';
select 'update directo de saved_cents (esperado: ERROR arriba y 400000)' as test, saved_cents from savings_goals where id='11111111-1111-4111-8111-111111111111';
update savings_goals set name='Viaje Europa' where id='11111111-1111-4111-8111-111111111111';
select 'editar nombre sí se permite (esperado Viaje Europa)' as test, name from savings_goals where id='11111111-1111-4111-8111-111111111111';
-- B no puede aportar a la meta de A ni verla
reset role; set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
insert into goal_contributions (user_id,goal_id,amount_cents) values (auth.uid(),'11111111-1111-4111-8111-111111111111',1);
select 'B ve metas de A (esperado 0)' as test, count(*) from savings_goals;
select 'B ve aportes de A (esperado 0)' as test, count(*) from goal_contributions;
select 'B lee reminder_log (esperado ERROR de permiso o 0)' as test, count(*) from reminder_log;
insert into push_subscriptions (user_id,endpoint,p256dh,auth) values ('aaaaaaaa-0000-4000-8000-000000000001','https://e/1','k','a');
reset role;
