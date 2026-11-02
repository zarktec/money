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
- Los correos de la app que no son de autenticación (recordatorios de pago, etc.) hoy salen por notificaciones push; si luego quieres enviarlos por correo con Resend, se agrega con `RESEND_API_KEY` en Vercel.
