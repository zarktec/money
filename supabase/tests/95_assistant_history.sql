\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
reset role;
insert into assistant_conversations (id, user_id, title) values ('cccccccc-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','de A'), ('cccccccc-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','de B');
insert into assistant_messages (conversation_id, user_id, role, content) values
  ('cccccccc-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','user','pregunta A'),
  ('cccccccc-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','assistant','respuesta A'),
  ('cccccccc-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','user','pregunta B');
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'A solo ve lo suyo (esperado 1 conversación | 2 mensajes)' as test, (select count(*) from assistant_conversations) c, (select count(*) from assistant_messages) m;
select 'mensajes en orden (esperado pregunta A, respuesta A)' as test, string_agg(content, ', ' order by seq) from assistant_messages;
insert into assistant_messages (conversation_id, user_id, role, content) values ('cccccccc-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','user','inyectado');
insert into assistant_conversations (user_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001','nueva');
update assistant_messages set content = 'editado';
select 'el cliente NO puede insertar ni editar (esperado 3 ERROR permission denied arriba)' as test;
delete from assistant_conversations where id = 'cccccccc-0000-4000-8000-00000000000b';
reset role;
select 'A no puede borrar lo de B (esperado B sigue: 1)' as test, count(*) from assistant_conversations where id = 'cccccccc-0000-4000-8000-00000000000b';
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from assistant_conversations where id = 'cccccccc-0000-4000-8000-00000000000a';
reset role;
select 'borrar la conversación borra sus mensajes (esperado A: 0 mensajes | B: 1)' as test, (select count(*) from assistant_messages where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') a, (select count(*) from assistant_messages where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') b;
