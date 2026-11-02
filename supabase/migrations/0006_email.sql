-- Fase 6: integración de correo (Gmail, Outlook, IMAP) y aprendizaje de reglas.

alter table email_connections
  add column default_account_id uuid references accounts(id) on delete set null,
  add column last_error text,
  add column last_stats jsonb;

-- Los secretos (refresh tokens, contraseñas IMAP) NUNCA deben poder leerse desde el cliente, ni siquiera cifrados.
-- Un revoke por columna no basta si la tabla tiene SELECT completo (el caso por defecto en Supabase),
-- así que se quita el permiso de tabla y se concede solo lo que la interfaz necesita ver. Todo lo demás lo hace el servidor.
revoke all on email_connections from authenticated, anon;
grant select (id, user_id, provider, email, last_sync_at, active, created_at, default_account_id, last_error, last_stats) on email_connections to authenticated;

revoke insert, update, delete on email_ingest_log from authenticated, anon;

-- Una regla propia por comercio (aprendizaje: si el usuario corrige una categoría, se recuerda).
create unique index merchants_user_pattern_idx on merchants (user_id, match_pattern) where user_id is not null;
