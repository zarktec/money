# Correos de la cuenta con Resend

Supabase envía los correos de autenticación (confirmar cuenta, recuperar contraseña, cambio de correo, enlace mágico).
Para que salgan desde tu dominio y por Resend, se conecta Resend como **SMTP personalizado** de Supabase. La app no cambia:
el flujo ya usa `{{ .ConfirmationURL }}` y vuelve a `/auth/callback`.

## 1. Resend
1. Crea cuenta en <https://resend.com> → **Domains** → *Add Domain* (recomendado un subdominio, p. ej. `mail.zark.pro`).
2. Resend muestra registros DNS (SPF, DKIM y MX de retorno). Agrégalos en el DNS de tu dominio y pulsa *Verify*. Hasta que esté en **Verified**, solo se puede enviar a tu propio correo.
3. **API Keys** → *Create API Key* con permiso *Sending access* (limitada a ese dominio). Cópiala: se muestra una sola vez.

## 2. Supabase → SMTP
Authentication → **Emails** → **SMTP Settings** → activa *Enable custom SMTP*:

| Campo | Valor |
|---|---|
| Sender email | `no-reply@mail.zark.pro` (un correo de tu dominio verificado) |
| Sender name | `Money` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | tu API key de Resend (`re_...`) |

Guarda. Después, en **Rate Limits** sube el límite de correos por hora (con SMTP propio el predeterminado es bajo).

## 3. Plantillas en español
Authentication → **Emails** → **Templates**. Pega el HTML de cada archivo de `supabase/email-templates/` y pon el asunto:

| Plantilla de Supabase | Archivo | Asunto sugerido |
|---|---|---|
| Confirm signup | `confirmar-cuenta.html` | Confirma tu cuenta de Money |
| Reset password | `recuperar-clave.html` | Restablece tu contraseña de Money |
| Change email address | `cambio-correo.html` | Confirma tu nuevo correo en Money |
| Magic link | `enlace-magico.html` | Tu enlace para ingresar a Money |

## 4. URLs (Authentication → URL Configuration)
- Site URL: `https://finance.zark.pro`
- Redirect URLs: `https://finance.zark.pro/auth/callback`

## 5. Probar
1. Regístrate con un correo que controles: debe llegar de `no-reply@mail.zark.pro` (revisa spam la primera vez).
2. Usa «¿Olvidaste tu contraseña?» y abre el enlace: debe llevarte a cambiar la clave.
3. En Resend → **Emails** ves cada envío, su entrega y los rebotes.

## Notas
- La API key vive solo en Supabase (SMTP); **no** hace falta como variable de entorno en Vercel.
- 

## Correos que envía la propia app (Resend API)
Además de los de cuenta, la app envía por Resend:
- **Recordatorios de pagos/ingresos por vencer** (cron diario): un solo correo por usuario con todos los del día.
- **Plan o prueba por vencer** (3 días y 1 día antes).
- **Recibo de pago** cuando Wompi aprueba un cobro.

Cada usuario puede apagarlos en **Más → Notificaciones** (`/cuenta/notificaciones`). Cada correo trae el enlace para hacerlo.

Variables en Vercel (Production y Preview):

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | API key de Resend (`re_...`) con permiso de envío |
| `MAIL_FROM` | `Money <avisos@mail.zark.pro>` (del dominio verificado) |
| `MAIL_REPLY_TO` | opcional |

Además, ejecuta una vez en el SQL Editor de Supabase: `supabase/migrations/0009_email_notifications.sql` (agrega la preferencia a `profiles`).
Sin `RESEND_API_KEY` y `MAIL_FROM` los envíos simplemente se omiten.

## Credenciales de integraciones desde el panel
Wompi, Google y Microsoft se configuran en **Administración → Integraciones** (`/admin/integraciones`), sin tocar variables de entorno ni volver a desplegar.
Requisitos: ejecutar `supabase/migrations/0010_integration_settings.sql` y tener `TOKEN_ENCRYPTION_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
