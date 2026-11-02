#!/usr/bin/env bash
# Genera supabase/setup.sql: todas las migraciones y la semilla en el orden correcto, para pegarlas de una vez en el editor SQL de Supabase.
# Orden: 0001 → semilla → 0002…000N (la semilla necesita las tablas de 0001 y las migraciones 0005+ necesitan las categorías sembradas).
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/setup.sql
{
  echo "-- Money: instalación completa (generado por scripts/build-setup-sql.sh; no editar a mano)."
  echo "-- Pégalo completo en Supabase → SQL Editor → New query → Run. Ejecútalo UNA sola vez en un proyecto nuevo."
  for f in supabase/migrations/0001_init.sql supabase/seed.sql $(ls supabase/migrations/0*.sql | grep -v 0001_init.sql | sort); do
    printf '\n-- ===================================================================\n-- %s\n-- ===================================================================\n' "$f"
    cat "$f"
  done
  cat <<'SQL'

-- ===================================================================
-- Usuarios que se registraron ANTES de instalar este esquema
-- ===================================================================
-- El disparador que crea el perfil y la cuenta «Efectivo» solo actúa sobre usuarios nuevos. Esto los crea para quienes ya existían
-- (no hace nada en un proyecto nuevo y es seguro ejecutarlo más de una vez).
insert into profiles (id, full_name)
  select id, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) from auth.users
  on conflict (id) do nothing;
insert into accounts (user_id, name, type)
  select u.id, 'Efectivo', 'cash' from auth.users u join profiles p on p.id = u.id
  where not exists (select 1 from accounts a where a.user_id = u.id);
SQL
} > "$out"
echo "Generado $out ($(wc -l < "$out") líneas)"
