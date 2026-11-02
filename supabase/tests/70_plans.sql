\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
update plans set limits = '{"accounts":2,"projects":1,"goals":2,"email_connections":0,"ai_requests_month":10}' where code='free';
update plans set limits = '{"accounts":10,"projects":10,"goals":20,"email_connections":2,"ai_requests_month":300}' where code='pro';
reset role; set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- plan gratis: ya tiene "Efectivo" (1); la 2.ª entra, la 3.ª no
insert into accounts (user_id, name) values (auth.uid(), 'Segunda');
insert into accounts (user_id, name) values (auth.uid(), 'Tercera');
select 'gratis: máximo 2 cuentas (esperado ERROR plan_limit:accounts arriba y 2)' as test, count(*) from accounts;
-- archivar libera cupo
update accounts set archived = true where name = 'Segunda';
insert into accounts (user_id, name) values (auth.uid(), 'Tercera');
select 'archivar libera cupo (esperado 2 activas)' as test, count(*) from accounts where not archived;
-- proyectos (1) y metas (2)
insert into projects (user_id, name) values (auth.uid(), 'P1');
insert into projects (user_id, name) values (auth.uid(), 'P2');
insert into savings_goals (user_id, name, target_cents, target_date) values (auth.uid(), 'G1', 100, '2027-01-01'), (auth.uid(), 'G2', 100, '2027-01-01');
insert into savings_goals (user_id, name, target_cents, target_date) values (auth.uid(), 'G3', 100, '2027-01-01');
select 'gratis: 1 proyecto y 2 metas (esperado ERROR x2 arriba | 1 | 2)' as test, (select count(*) from projects) p, (select count(*) from savings_goals) g;

-- BUG corregido: un checkout sin pagar (pending) NO da derechos de Pro
reset role;
insert into subscriptions (user_id, plan_id, status) select 'aaaaaaaa-0000-4000-8000-000000000001', id, 'pending' from plans where code='pro';
select 'pending no da derechos (esperado 2 = límite gratis)' as test, plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'accounts');
-- el estado trialing SIN fecha de fin (como lo dejaba el checkout viejo) tampoco
update subscriptions set status = 'trialing', current_period_end = null where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'trialing sin fecha de fin no da derechos (esperado 2)' as test, plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'accounts');
-- activa y vigente sí
update subscriptions set status = 'active', current_period_end = now() + interval '10 days' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'activa vigente da Pro (esperado 10)' as test, plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'accounts');
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into accounts (user_id, name) values (auth.uid(), 'Tercera Pro');
insert into projects (user_id, name) values (auth.uid(), 'P2 Pro');
select 'con Pro entran la 3.ª cuenta y el 2.º proyecto (esperado 3 | 2)' as test, (select count(*) from accounts where not archived) a, (select count(*) from projects) p;
-- en mora dentro del periodo pagado conserva derechos
reset role;
update subscriptions set status = 'past_due' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'past_due vigente conserva Pro (esperado 10)' as test, plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'accounts');
update subscriptions set status = 'active' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
-- vencida deja de dar derechos
reset role;
update subscriptions set current_period_end = now() - interval '1 day' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'vencida vuelve al plan gratis (esperado 2)' as test, plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'accounts');
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into accounts (user_id, name) values (auth.uid(), 'Cuarta');
select 'vencida: no deja crear más (esperado ERROR arriba)' as test;
-- clave ausente en el plan = sin límite
reset role;
update plans set limits = '{"accounts":10}' where code='pro';
update subscriptions set current_period_end = now() + interval '5 days' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'clave ausente = sin límite (esperado NULL)' as test, plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'projects');
-- otro usuario no se ve afectado y los clientes no pueden llamar plan_limit
set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select plan_limit('aaaaaaaa-0000-4000-8000-000000000001', 'accounts');
select 'cliente no puede consultar límites ajenos (esperado ERROR arriba)' as test;
reset role;
-- una prueba por usuario y plan
insert into subscriptions (user_id, plan_id, status, trial_started_at, current_period_end) select 'bbbbbbbb-0000-4000-8000-000000000002', id, 'trialing', now(), now() + interval '14 days' from plans where code='pro';
insert into subscriptions (user_id, plan_id, status, trial_started_at, current_period_end) select 'bbbbbbbb-0000-4000-8000-000000000002', id, 'trialing', now(), now() + interval '14 days' from plans where code='pro';
select 'una sola prueba por usuario y plan (esperado 1)' as test, count(*) from subscriptions where user_id='bbbbbbbb-0000-4000-8000-000000000002' and trial_started_at is not null;
-- pagos normales (sin trial) sí pueden repetirse
insert into subscriptions (user_id, plan_id, status) select 'bbbbbbbb-0000-4000-8000-000000000002', id, 'pending' from plans where code='pro';
insert into subscriptions (user_id, plan_id, status) select 'bbbbbbbb-0000-4000-8000-000000000002', id, 'pending' from plans where code='pro';
select 'checkouts pendientes repetidos no chocan (esperado 3 filas)' as test, count(*) from subscriptions where user_id='bbbbbbbb-0000-4000-8000-000000000002';
