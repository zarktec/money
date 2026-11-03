-- Fase 9: historial de las conversaciones con el asistente (por usuario).
-- El usuario solo LEE y BORRA lo suyo; las filas las escribe el servidor (service role) al responder, así nadie puede inyectar mensajes.
create table assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Nueva conversación' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assistant_conversations (user_id, updated_at desc);

create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,                     -- orden estable aunque dos mensajes compartan la misma hora
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index on assistant_messages (conversation_id, seq);
create index on assistant_messages (user_id);

alter table assistant_conversations enable row level security;
alter table assistant_messages enable row level security;
create policy assistant_conv_read on assistant_conversations for select using (user_id = auth.uid());
create policy assistant_conv_delete on assistant_conversations for delete using (user_id = auth.uid());
create policy assistant_msg_read on assistant_messages for select using (user_id = auth.uid());
create policy assistant_msg_delete on assistant_messages for delete using (user_id = auth.uid());
-- Sin política de insert/update: el cliente no puede crear ni editar mensajes. Además se quitan esos permisos de tabla.
revoke insert, update on assistant_conversations, assistant_messages from anon, authenticated;
