\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
reset role; set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into shared_groups (id, user_id, name) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'Viaje');
insert into shared_members (id, group_id, user_id, name, is_me) values
 ('aaaa2222-0000-4000-8000-000000000001','aaaa1111-0000-4000-8000-000000000001',auth.uid(),'Yo',true),
 ('aaaa2222-0000-4000-8000-000000000002','aaaa1111-0000-4000-8000-000000000001',auth.uid(),'Ana',false),
 ('aaaa2222-0000-4000-8000-000000000003','aaaa1111-0000-4000-8000-000000000001',auth.uid(),'Luis',false);
insert into shared_members (group_id, user_id, name, is_me) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'Otro yo', true);
select 'solo un "yo" por grupo (esperado ERROR arriba y 1)' as test, count(*) from shared_members where is_me;

-- gasto de 300.000 pagado por mí, dividido en 3; registrando mi parte como gasto propio
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Cena',30000000,'aaaa2222-0000-4000-8000-000000000001','2026-11-01',
  '{"aaaa2222-0000-4000-8000-000000000001":10000000,"aaaa2222-0000-4000-8000-000000000002":10000000,"aaaa2222-0000-4000-8000-000000000003":10000000}'::jsonb,
  true,(select id from accounts where user_id=auth.uid() limit 1), null) is not null as creado;
select 'gasto + 3 partes + mi parte como gasto propio (esperado 1 | 3 | 1 | 10000000)' as test,
  (select count(*) from shared_expenses) gastos, (select count(*) from shared_splits) partes,
  (select count(*) from transactions where description='Compartido: Cena') tx, (select amount_cents from transactions where description='Compartido: Cena') mi_parte;
-- partes que no suman
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Mal',30000000,'aaaa2222-0000-4000-8000-000000000001','2026-11-01','{"aaaa2222-0000-4000-8000-000000000001":1}'::jsonb);
-- participante de otro grupo / inexistente
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Mal2',100,'aaaa2222-0000-4000-8000-000000000001','2026-11-01','{"bbbb0000-0000-4000-8000-000000000009":100}'::jsonb);
-- parte negativa y valor cero
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Mal3',100,'aaaa2222-0000-4000-8000-000000000001','2026-11-01','{"aaaa2222-0000-4000-8000-000000000001":200,"aaaa2222-0000-4000-8000-000000000002":-100}'::jsonb);
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Cero',0,'aaaa2222-0000-4000-8000-000000000001','2026-11-01','{"aaaa2222-0000-4000-8000-000000000001":0}'::jsonb);
select 'los 4 intentos inválidos no dejaron nada (esperado 1 gasto)' as test, count(*) from shared_expenses;
-- escritura directa bloqueada
insert into shared_expenses (group_id, user_id, description, amount_cents, paid_by) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'Directo', 100, 'aaaa2222-0000-4000-8000-000000000001');
insert into shared_splits (expense_id, member_id, group_id, user_id, share_cents) select id, 'aaaa2222-0000-4000-8000-000000000001', group_id, user_id, 999 from shared_expenses limit 1;
update shared_expenses set amount_cents = 1;
delete from shared_splits;
select 'escritura directa bloqueada (esperado 4 ERROR arriba y gasto intacto 30000000)' as test, (select amount_cents from shared_expenses) monto, (select count(*) from shared_splits) partes;
-- liquidación válida e inválida (mismo miembro; miembro de otro grupo)
insert into shared_settlements (group_id, user_id, from_member, to_member, amount_cents) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'aaaa2222-0000-4000-8000-000000000002', 'aaaa2222-0000-4000-8000-000000000001', 5000000);
insert into shared_settlements (group_id, user_id, from_member, to_member, amount_cents) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'aaaa2222-0000-4000-8000-000000000002', 'aaaa2222-0000-4000-8000-000000000002', 1);
insert into shared_settlements (group_id, user_id, from_member, to_member, amount_cents) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'aaaa2222-0000-4000-8000-000000000002', 'aaaa2222-0000-4000-8000-000000000001', 0);
select 'liquidaciones (esperado 1: las 2 inválidas fallan)' as test, count(*) from shared_settlements;

-- B no ve ni toca nada de A, ni puede usar sus funciones
reset role; set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select 'B ve grupos/gastos/miembros de A (esperado 0|0|0)' as test, (select count(*) from shared_groups) g, (select count(*) from shared_expenses) e, (select count(*) from shared_members) m;
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Robo',100,'aaaa2222-0000-4000-8000-000000000001','2026-11-01','{"aaaa2222-0000-4000-8000-000000000001":100}'::jsonb);
select delete_shared_expense((select id from shared_expenses limit 1));
insert into shared_members (group_id, user_id, name) values ('aaaa1111-0000-4000-8000-000000000001', auth.uid(), 'Intruso');
select 'B no puede crear gastos, borrar ni agregarse a grupos ajenos (esperado 3 ERROR)' as test;
-- sin sesión (anon) no puede ejecutar las funciones
reset role; set role anon;
select create_shared_expense('aaaa1111-0000-4000-8000-000000000001','Anon',100,'aaaa2222-0000-4000-8000-000000000001','2026-11-01','{}'::jsonb);
reset role;

-- borrar el gasto borra sus partes y mi gasto propio vinculado
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select delete_shared_expense((select id from shared_expenses limit 1));
select 'borrar gasto (esperado 0 | 0 | 0)' as test, (select count(*) from shared_expenses) e, (select count(*) from shared_splits) s, (select count(*) from transactions where description='Compartido: Cena') tx;
reset role;
