-- Fase 9: credenciales de integraciones (Wompi, Google, Microsoft) administrables desde el panel del super admin.
-- Los secretos se guardan CIFRADOS (AES-256-GCM con TOKEN_ENCRYPTION_KEY); los datos públicos (ids de cliente, URL) en claro.
-- Sin políticas RLS y sin permisos para anon/authenticated: solo el servidor (service role) lee y escribe, y únicamente después
-- de comprobar que quien llama es super admin. Una variable de entorno con el mismo nombre sirve de respaldo si no hay valor aquí.
create table integration_settings (
  provider text not null,
  key text not null,
  value text not null,
  is_secret boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (provider, key)
);
alter table integration_settings enable row level security;
revoke all on integration_settings from anon, authenticated;
