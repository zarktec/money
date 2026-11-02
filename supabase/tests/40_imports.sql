\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.co'), ('bbbbbbbb-0000-4000-8000-000000000002','b@x.co') on conflict do nothing;
select 'comercios sembrados, todos con categoría (esperado > 50 | 0 sin categoría)' as test, count(*) total, count(*) filter (where category_id is null) sin_categoria from merchants where user_id is null;
reset role; set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into import_batches (id,user_id,source,row_count) values ('33333333-3333-4333-8333-333333333333', auth.uid(), 'statement_csv', 2);
insert into transactions (user_id,type,amount_cents,source,import_batch_id,dedupe_hash) values (auth.uid(),'expense',100,'statement_import','33333333-3333-4333-8333-333333333333','h1'),(auth.uid(),'expense',200,'natural_language','33333333-3333-4333-8333-333333333333','h2');
select 'transacciones del lote (esperado 2)' as test, count(*) from transactions where import_batch_id='33333333-3333-4333-8333-333333333333';
delete from transactions where import_batch_id='33333333-3333-4333-8333-333333333333';
delete from import_batches where id='33333333-3333-4333-8333-333333333333';
select 'deshacer importación (esperado 0 | 0)' as test, (select count(*) from transactions where dedupe_hash in ('h1','h2')), (select count(*) from import_batches);
-- el usuario no puede falsear su consumo de IA
insert into ai_usage (user_id, kind) values (auth.uid(), 'text');
select 'usuario no puede insertar en ai_usage (esperado ERROR arriba y 0)' as test, count(*) from ai_usage;
-- el servidor (rol dueño) sí; el usuario lee solo lo suyo
reset role;
insert into ai_usage (user_id, kind, input_tokens, output_tokens) values ('aaaaaaaa-0000-4000-8000-000000000001','text',100,20), ('bbbbbbbb-0000-4000-8000-000000000002','receipt',500,30);
set role authenticated; set request.jwt.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'A lee solo su consumo (esperado 1)' as test, count(*) from ai_usage;
update ai_usage set input_tokens = 0;
delete from ai_usage;
select 'A no puede editar ni borrar su consumo (esperado ERROR x2 y 1 fila con 100 tokens)' as test, count(*), min(input_tokens) from ai_usage;
-- B no ve lotes de A
reset role; set role authenticated; set request.jwt.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select 'B ve lotes de A (esperado 0)' as test, count(*) from import_batches;
reset role;
