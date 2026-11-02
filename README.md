# Money — finanzas personales (Colombia primero)

Web app responsive, optimizada para móvil (PWA), con suscripciones por Wompi y panel de super admin.
Stack: **Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + RLS) · Wompi · Vercel**.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local      # completa las variables
npm run dev
node scripts/smoke.mjs URL      # recorrido en Chromium móvil (CSP, hidratación, login, redirecciones); requiere Playwright
npm test                        # lógica financiera, validaciones, importación, capa de IA y endpoints
scripts/test-db.sh              # migraciones + pruebas de RLS contra un Postgres local
```

### Base de datos
1. Crea un proyecto en Supabase.
2. Ejecuta en orden `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, y luego `0002_default_account.sql`, `0003_planning.sql`, `0004_debts_networth.sql`, `0005_imports_ai.sql`, `0006_email.sql`, `0007_shared.sql` y `0008_plans_enforcement.sql` (SQL Editor o `supabase db push`).
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

### Correo (fase 6)
- **Gmail**: Google Cloud Console → habilita *Gmail API* → pantalla de consentimiento → alcance `gmail.readonly` → credenciales OAuth «Aplicación web» con redirección `{APP_URL}/api/email/google/callback`. ⚠️ Mientras la app esté en modo *Testing*, Google **vence los refresh tokens a los 7 días** y limita a 100 usuarios de prueba: para producción hace falta publicarla y pasar la verificación de seguridad (CASA) por usar un alcance restringido.
- **Outlook**: Microsoft Entra ID → registro de aplicación (cuentas personales y de trabajo) → redirección web `{APP_URL}/api/email/microsoft/callback` → permisos delegados `Mail.Read`, `User.Read`, `offline_access` → secreto de cliente.
- **IMAP**: solo puerto 993 (TLS) y servidores públicos, con contraseña de aplicación. POP3 no se soporta.
- Variables: `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, `OAUTH_STATE_SECRET`, `TOKEN_ENCRYPTION_KEY` (ver `.env.example`). El cron `/api/cron/email-sync` corre cada hora.

### Páginas legales
`/privacidad` y `/terminos` son un **borrador sin revisión legal** y muestran un aviso mientras tanto; los puntos que requieren decisión salen resaltados. Completa `NEXT_PUBLIC_LEGAL_NAME/NIT/ADDRESS/EMAIL` y, cuando un abogado los apruebe, pon `NEXT_PUBLIC_LEGAL_REVIEWED=true`.

### Seguridad de la aplicación
CSP con nonce por petición (middleware), HSTS, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy. Si agregas analítica, mapas o widgets de terceros, hay que ampliar la CSP en `src/lib/csp.ts`. Las páginas son dinámicas a propósito (un nonce por petición no admite HTML estático).

## Diseño clave
- **Montos como enteros** (centavos). Nunca floats. Ver `src/lib/finance/`.
- **Provisiones**: un pago anual/semestral/trimestral se divide en cuota mensual (`monthlyProvision`).
- **Disponible para gastar** = ingresos − gastos − provisiones − aportes a metas − fijos pendientes.
- **Metas**: cuota mensual = restante / meses hasta la fecha, recalculada con lo ya ahorrado.
- **Secretos de correo**: cifrados con AES-256-GCM atados a su dueño, y el cliente no puede leer esa columna (permiso por columna en la base de datos).
- **Planes**: los límites (cuentas, proyectos, metas) los hace cumplir la base de datos con triggers; solo una suscripción activa, en prueba o en mora **con fecha de fin futura** da derechos (un checkout sin pagar nunca los da). Eliminar la cuenta borra todo salvo los pagos, que quedan anonimizados por obligación contable.
- **Asistente**: el modelo solo puede invocar consultas de solo lectura predefinidas (con argumentos validados) que se ejecutan con la sesión del usuario; no escribe SQL ni modifica datos. Cada pregunta consume 1 del cupo mensual de IA.
- **Gastos compartidos**: las partes de cada gasto se validan en la base de datos (función SQL) y las escrituras directas están bloqueadas.
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
| 6 | Correo (Gmail, Outlook, IMAP) con filtro previo, IA, deduplicación, bandeja de revisión, reglas aprendidas y detección de suscripciones | ✅ |
| 7 | Gastos compartidos y asistente conversacional | ✅ |
| 7 | Open banking (Belvo/Prometeo) y multimoneda | ⏳ requiere contrato con el agregador |
| 8 | Página de precios, límites por plan en la base de datos, prueba gratis sin tarjeta, «Mi plan», renovación asistida con avisos, exportar a Excel/PDF/JSON, respaldo y eliminar cuenta | ✅ |
| 8 | Renovación automática con tarjeta guardada en Wompi | ⏳ pendiente: no pude verificar la API de Wompi |

> Wompi: hoy el cobro es por checkout (pago único por periodo). La renovación automática requiere crear una *fuente de pago* tokenizada; está en la fase 8.
> Gmail: el alcance `gmail.readonly` es restringido; Google exige verificación de seguridad (CASA) para publicarlo.
