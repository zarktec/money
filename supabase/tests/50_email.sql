\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
-- el servidor (service role / dueño) crea la conexión con un secreto
reset role;
insert into email_connections (user_id, provider, email, secret_encrypted, default_account_id)
  select 'aaaaaaaa-0000-4000-8000-000000000001','gmail','a@gmail.com','v1:SECRETO_CIFRADO', id from accounts where user_id='aaaaaaaa-0000-4000-8000-000000000001' limit 1;
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'A ve sus conexiones sin secretos (esperado 1)' as test, count(*) from (select id, provider, email, last_sync_at, active, default_account_id, last_error from email_connections) x;
select * from email_connections;
select secret_encrypted from email_connections;
insert into email_connections (user_id, provider, email, secret_encrypted) values (auth.uid(), 'imap', 'x@y.co', 'falso');
update email_connections set secret_encrypted = 'robado';
update email_connections set active = false;
delete from email_connections;
select 'A no puede leer, insertar, editar ni borrar con acceso directo (esperado: 6 ERROR arriba y 1 fila intacta)' as test, count(*) from (select id from email_connections) x;
reset role;
select 'el secreto sigue intacto (esperado v1:SECRETO_CIFRADO)' as test, secret_encrypted from email_connections;
set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select 'B no ve conexiones de A (esperado 0)' as test, count(*) from (select id from email_connections) x;
insert into email_ingest_log (user_id, message_id, outcome) values (auth.uid(), 'm1', 'ignored');
select 'cliente no escribe el log (esperado ERROR arriba)' as test;
reset role;
-- idempotencia del log y de los movimientos importados de correo
insert into email_ingest_log (user_id, message_id, outcome) values ('aaaaaaaa-0000-4000-8000-000000000001','m1','extracted');
insert into email_ingest_log (user_id, message_id, outcome) values ('aaaaaaaa-0000-4000-8000-000000000001','m1','extracted');
insert into transactions (user_id,type,amount_cents,source,status,external_id) values ('aaaaaaaa-0000-4000-8000-000000000001','expense',100,'email','pending_review','email:m1:0');
insert into transactions (user_id,type,amount_cents,source,status,external_id) values ('aaaaaaaa-0000-4000-8000-000000000001','expense',100,'email','pending_review','email:m1:0');
select 'mismo correo no se registra dos veces (esperado 1 | 1)' as test, (select count(*) from email_ingest_log where message_id='m1') log, (select count(*) from transactions where external_id='email:m1:0') tx;
-- una regla propia por comercio
insert into merchants (user_id, name, match_pattern, category_id) values ('aaaaaaaa-0000-4000-8000-000000000001','Tienda','tienda juan',null);
insert into merchants (user_id, name, match_pattern, category_id) values ('aaaaaaaa-0000-4000-8000-000000000001','Tienda 2','tienda juan',null);
select 'regla propia única por patrón (esperado 1)' as test, count(*) from merchants where user_id='aaaaaaaa-0000-4000-8000-000000000001' and match_pattern='tienda juan';
