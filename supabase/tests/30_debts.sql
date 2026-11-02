\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
reset role; set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into debts (id,user_id,name,principal_cents,balance_cents,annual_rate,installment_cents,total_installments,next_due_date)
  values ('22222222-2222-4222-8222-222222222222', auth.uid(),'Moto',10000000,10000000,12.6825,1000000,12,'2026-12-05');
select 'pago normal (interés 100000, capital 900000)' as test,
  register_debt_payment('22222222-2222-4222-8222-222222222222', 1000000, '2026-11-05', (select id from accounts where user_id=auth.uid() limit 1), (select id from expense_categories where name='Deudas y créditos'), 100000, 900000, 10000000) is not null as ok;
select 'saldo, cuotas, próximo vencimiento, activa (esperado 9100000 | 1 | 2027-01-05 | t)' as test, balance_cents, paid_installments, next_due_date, active from debts where id='22222222-2222-4222-8222-222222222222';
select 'se creó el egreso y el detalle (esperado 1 | 1)' as test, (select count(*) from transactions where description='Pago Moto') tx, (select count(*) from debt_payments) pagos;
-- saldo desactualizado: debe fallar y no dejar nada a medias
select register_debt_payment('22222222-2222-4222-8222-222222222222', 1000000, '2026-11-06', null, null, 100000, 900000, 10000000);
select 'tras rechazo por saldo viejo, nada cambió (esperado 9100000 | 1 | 1)' as test, (select balance_cents from debts where id='22222222-2222-4222-8222-222222222222') saldo, (select count(*) from transactions where description='Pago Moto') tx, (select count(*) from debt_payments) pagos;
-- capital mayor al saldo
select register_debt_payment('22222222-2222-4222-8222-222222222222', 99999999, '2026-11-06', null, null, 0, 99999999, 9100000);
-- pago final salda la deuda
select register_debt_payment('22222222-2222-4222-8222-222222222222', 9100000, '2026-12-05', null, null, 0, 9100000, 9100000) is not null as pago_final;
select 'deuda saldada (esperado 0 | f)' as test, balance_cents, active from debts where id='22222222-2222-4222-8222-222222222222';
-- B no puede pagar la deuda de A
reset role; set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select register_debt_payment('22222222-2222-4222-8222-222222222222', 1, '2026-11-06', null, null, 0, 1, 0);
select 'B ve deudas de A (esperado 0)' as test, count(*) from debts;
-- bienes
insert into assets (user_id,name,kind,value_cents) values (auth.uid(),'Apartamento','property',25000000000);
insert into assets (user_id,name,kind,value_cents) values ('aaaaaaaa-0000-4000-8000-000000000001','Falso','other',1);
insert into assets (user_id,name,kind,value_cents) values (auth.uid(),'Negativo','other',-5);
select 'B ve solo su bien (esperado 1)' as test, count(*) from assets;
reset role;
