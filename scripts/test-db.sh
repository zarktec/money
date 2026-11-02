#!/usr/bin/env bash
# Prueba migraciones, semillas y RLS contra un Postgres local (con un stub mínimo de Supabase).
# Uso: PGHOST=/tmp PGPORT=5544 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists money_test" -c "create database money_test"
for f in supabase/tests/00_auth_stub.sql supabase/migrations/0001_init.sql supabase/seed.sql supabase/migrations/0002_default_account.sql supabase/migrations/0003_planning.sql supabase/migrations/0004_debts_networth.sql supabase/migrations/0005_imports_ai.sql supabase/migrations/0006_email.sql; do $P -d money_test -f "$f"; done
echo "== Pruebas RLS (revisa que cada línea coincida con lo esperado) =="
for t in supabase/tests/10_rls_isolation.sql supabase/tests/20_planning.sql supabase/tests/30_debts.sql supabase/tests/40_imports.sql supabase/tests/50_email.sql; do echo "-- $t"; psql -d money_test -f "$t" 2>&1 | grep -v -E '^$|^(SET|RESET|INSERT|UPDATE|DELETE)'; done
