 # Umbra Email Setup

Esta guia deja listos dos frentes:

- correos transaccionales propios de Umbra desde el backend
- correos de confirmacion/autenticacion de Supabase con nombre y estilo de Umbra

## 1. Correos transaccionales de Umbra

Umbra ya soporta enviar correos propios para:

- prueba del correo principal
- prueba del correo de respaldo

Configura estas variables en tu entorno local y en Render:

```env
MAIL_FROM_NAME=Umbra
MAIL_FROM_EMAIL=no-reply@tu-dominio.com
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-usuario-smtp
SMTP_PASS=tu-password-smtp
SMTP_REPLY_TO=soporte@tu-dominio.com
PUBLIC_APP_URL=https://tu-dominio.com
VITE_PUBLIC_APP_URL=https://tu-dominio.com
```

Ejemplos de proveedores SMTP validos:

- Resend
- AWS SES
- Postmark
- SendGrid
- Brevo

## 2. Cambiar "Supabase Auth" por "Umbra"

Los correos de confirmacion reales de Supabase no se renombran desde este repo.
Eso se cambia en el dashboard de Supabase usando SMTP propio y plantillas.

Ruta general:

1. Abre tu proyecto en Supabase
2. Ve a `Authentication`
3. Entra a `SMTP Settings`
4. Activa `Custom SMTP`
5. Completa:
   - `Sender name`: `Umbra`
   - `Admin email`: `no-reply@tu-dominio.com`
   - host, puerto, usuario y password SMTP
6. Guarda

Referencia oficial:

- `https://supabase.com/docs/guides/auth/auth-smtp`

## 2.1 Redirect URLs limpias para Auth

Umbra ya no debe reutilizar la URL completa actual del navegador para `redirect_to`.
En web usa una ruta fija y limpia:

- `https://tu-dominio.com/auth/callback`

En Supabase debes registrar esa URL en:

1. `Authentication`
2. `URL Configuration`
3. `Redirect URLs`

Recomendado:

- `Site URL`: `https://tu-dominio.com`
- `Redirect URL`: `https://tu-dominio.com/auth/callback`

Esto evita que se reciclen URLs contaminadas con parametros como `code`, `token_hash` o `access_denied`.

## 3. Dar estilo profesional a los correos de confirmacion de Supabase

Con SMTP propio activo:

1. Ve a `Authentication`
2. Entra a `Email Templates`
3. Edita:
   - `Confirm signup`
   - `Reset password`
   - `Magic Link` si lo usas
   - `Invite user` si lo usas
4. Cambia asunto, HTML y copy para que digan `Umbra`

Referencia oficial:

- `https://supabase.com/docs/guides/auth/auth-email-templates`

## 4. Nota importante sobre el correo de respaldo

El correo de respaldo de Umbra no es una cuenta de Auth dentro de Supabase.
Por eso no conviene enviarlo con `supabase.auth.resetPasswordForEmail(...)`.

Umbra ya quedo preparado para enviarlo como correo propio por SMTP.
Si no configuras SMTP, ese boton no puede entregar un correo real.

## 5. Recomendacion de produccion

- usa un subdominio como `auth.tu-dominio.com`
- configura SPF, DKIM y DMARC
- usa `no-reply@auth.tu-dominio.com`
- evita el SMTP por defecto de Supabase para produccion
