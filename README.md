# Money — finanzas personales (Colombia primero)

Web app responsive, optimizada para móvil (PWA), con suscripciones por Wompi y panel de super admin.
Stack: **Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + RLS) · Wompi · Vercel**.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local      # completa las variables
npm run dev
npm test                        # lógica financiera, validaciones, importación, capa de IA y endpoints
scripts/test-db.sh              # migraciones + pruebas de RLS contra un Postgres local
```

### Base de datos
1. Crea un proyecto en Supabase.
2. Ejecuta en orden `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `supabase/migrations/0002_default_account.sql`, `supabase/migrations/0003_planning.sql`, `supabase/migrations/0004_debts_networth.sql` y `supabase/migrations/0005_imports_ai.sql` (SQL Editor o `supabase db push`).
3. Registra tu usuario en la app y conviértelo en super admin:
   ```sql
   update profiles set role = 'super_admin' where id = (select id from auth.users where email = 'tu@correo.com');
   ```

### Despliegue en Vercel
1. Importa el repo y define **todas** las variables de `.env.example` (Node 22).
2. Los crons (`vercel.json`) llaman a `/api/cron/*` con `Authorization: Bearer $CRON_SECRET`.
3. Notificaciones push: `npx web-push generate-vapid-keys` y carga `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. Sin ellas el cron de recordatorios se omite sin error.
4. En Wompi (Desarrolladores → Eventos) configura la URL de eventos: `https://TU_DOMINIO/api/wompi/webhook`.
5. En Supabase → Auth → URL Configuration agrega `https://TU_DOMINIO/auth/callback`.

## Diseño clave
- **Montos como enteros** (centavos). Nunca floats. Ver `src/lib/finance/`.
- **Provisiones**: un pago anual/semestral/trimestral se divide en cuota mensual (`monthlyProvision`).
- **Disponible para gastar** = ingresos − gastos − provisiones − aportes a metas − fijos pendientes.
- **Metas**: cuota mensual = restante / meses hasta la fecha, recalculada con lo ya ahorrado.
- **Bandeja de revisión**: lo detectado automáticamente (correo/OCR/banco) entra como `pending_review`.
- **Seguridad**: RLS en todas las tablas; el precio del plan se lee siempre en servidor; el webhook de Wompi verifica checksum, monto e idempotencia; `/admin` responde 404 a quien no es super admin.
- **Privacidad**: consentimiento explícito (Ley 1581 de 2012) guardado en `profiles.data_consent_at`.

## Estado y roadmap

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Esquema completo, RLS, semillas CO, lógica financiera con tests | ✅ |
| 1 | Auth, shell móvil, dashboard "disponible", super admin (usuarios, planes, catálogos) | ✅ |
| 1 | Cobro Wompi (checkout firmado + webhook) y crons | ✅ |
| 2 | Cuentas, ingresos, egresos, recurrentes con provisión, transferencias, categorías propias, captura rápida "+", movimientos con filtros y bandeja de revisión | ✅ |
| 3 | Metas de ahorro con aportes, proyectos, presupuestos con alertas, calendario de vencimientos (pagar/omitir) y recordatorios push | ✅ |
| 4 | Deudas con simulador avalancha vs. bola de nieve, patrimonio neto, proyección de caja a 3/6/12 meses y puntaje de salud financiera | ✅ |
| 5 | Importar extractos (CSV gratis, PDF con IA), foto de recibo y entrada por texto o voz, con vista previa, duplicados, deshacer y límite de IA por plan | ✅ |
| 6 | Correo (Gmail/Outlook/IMAP) + bandeja de revisión + reglas aprendidas | ⏳ |
| 7 | Open banking (Belvo/Prometeo), gastos compartidos, asistente conversacional | ⏳ |
| 8 | Página de precios, límites por plan, renovación automática con fuente de pago Wompi | ⏳ |

> Wompi: hoy el cobro es por checkout (pago único por periodo). La renovación automática requiere crear una *fuente de pago* tokenizada; está en la fase 8.
> Gmail: el alcance `gmail.readonly` es restringido; Google exige verificación de seguridad (CASA) para publicarlo.
