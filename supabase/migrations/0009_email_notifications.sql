-- Fase 9: el usuario decide si la app le envía avisos por correo (recordatorios, vencimiento del plan, recibos de pago).
-- Los correos de la cuenta (confirmar, recuperar contraseña) los envía Supabase Auth y no dependen de esto.
alter table profiles add column if not exists email_notifications boolean not null default true;
