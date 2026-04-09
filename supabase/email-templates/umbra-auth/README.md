# Umbra Auth Email Templates

Templates listos para pegar en `Supabase > Authentication > Emails > Templates`.

## Carpeta

`supabase/email-templates/umbra-auth/`

## Archivos y destino exacto

| Archivo | Template en Supabase |
| --- | --- |
| `01-confirm-sign-up.html` | `Confirm sign up` |
| `02-invite-user.html` | `Invite user` |
| `03-magic-link.html` | `Magic link` |
| `04-change-email-address.html` | `Change email address` |
| `05-reset-password.html` | `Reset password` |
| `06-reauthentication.html` | `Reauthentication` |
| `subjects.json` | Asuntos sugeridos para cada template |

## Placeholders usados

Estos templates usan placeholders oficiales de Supabase:

- `{{ .ConfirmationURL }}`
- `{{ .Token }}`
- `{{ .SiteURL }}`
- `{{ .RedirectTo }}`
- `{{ .Email }}`
- `{{ .NewEmail }}`

## Como usarlos

1. Abre tu proyecto en Supabase.
2. Ve a `Authentication`.
3. Entra a `Emails`.
4. Abre cada template correspondiente.
5. Copia el HTML del archivo correcto.
6. Usa el asunto sugerido de `subjects.json`.

## Flujo recomendado

- `Confirm sign up`: confirma correo y activa acceso.
- `Invite user`: invita a crear cuenta y unirse.
- `Magic link`: acceso rapido sin clave.
- `Change email address`: valida el nuevo correo.
- `Reset password`: restablece la clave.
- `Reauthentication`: confirma una accion sensible.

## Recomendacion

Para que el remitente ya no salga como `Supabase Auth`, activa `Custom SMTP` y configura:

- `Sender name`: `Umbra`
- `Admin email`: tu correo de salida real

## Referencias oficiales

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
