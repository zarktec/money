\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co') on conflict do nothing;
reset role; insert into integration_settings (provider, key, value, is_secret) values ('wompi','events_secret','v1:xxxx', true);
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'usuario normal NO lee integration_settings (esperado ERROR permission denied arriba)' as test;
select count(*) from integration_settings;
update integration_settings set value = 'hack';
insert into integration_settings (provider, key, value) values ('google','client_id','x');
delete from integration_settings;
reset role; set role anon;
select count(*) from integration_settings;
reset role;
select 'el servidor (service role) sí lee y la fila no cambió (esperado 1 | v1:xxxx)' as test, count(*), min(value) from integration_settings;
