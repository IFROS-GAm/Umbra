# Umbra: implementacion y decisiones

## Que hice

1. Rebrand completo a `Umbra`.
2. Migre el backend para que deje de confiar en `userId` enviado por el cliente.
3. Conecte el frontend a Supabase Auth con sesion real.
4. Prepare Electron para empaquetado instalable con `electron-builder`.
5. Actualice schema y seed para que usuarios nuevos entren a servidores por defecto.

## Como lo hice

### 1. Backend seguro

- Cree [`server/start-server.js`](/c:/Users/User/Desktop/Discord-IFROS/server/start-server.js) como servidor reutilizable.
- Mantengo [`server/index.js`](/c:/Users/User/Desktop/Discord-IFROS/server/index.js) solo como entrypoint pequeno.
- Agregue `helmet`, `compression` y `express-rate-limit`.
- Cerre el backend sobre `Bearer token` validado contra Supabase con [`server/store/supabase-store.js`](/c:/Users/User/Desktop/Discord-IFROS/server/store/supabase-store.js).
- Las rutas ahora usan `req.viewer.id` derivado del token, no ids enviados por el cliente.
- Los sockets ahora autentican con `socket.handshake.auth.token`.

### 2. Auth real en cliente

- Rehice [`src/App.jsx`](/c:/Users/User/Desktop/Discord-IFROS/src/App.jsx) para usar Supabase Auth.
- Anadi [`src/supabase-browser.js`](/c:/Users/User/Desktop/Discord-IFROS/src/supabase-browser.js).
- Cree [`src/components/AuthScreen.jsx`](/c:/Users/User/Desktop/Discord-IFROS/src/components/AuthScreen.jsx) con:
  - signup email/password
  - login email/password
  - OTP por codigo
  - flujo preparado para Google OAuth
- Actualice [`src/api.js`](/c:/Users/User/Desktop/Discord-IFROS/src/api.js) para enviar `Authorization: Bearer ...`.

### 3. Umbra visual

- Mantengo el layout principal en [`src/components/UmbraWorkspace.jsx`](/c:/Users/User/Desktop/Discord-IFROS/src/components/UmbraWorkspace.jsx).
- Reforce el tema oscuro y anadi la pantalla de acceso en [`src/styles.css`](/c:/Users/User/Desktop/Discord-IFROS/src/styles.css).
- Cambie textos, seed y copys de IFROS a Umbra.

### 4. Desktop instalable

- Rehice [`electron/main.cjs`](/c:/Users/User/Desktop/Discord-IFROS/electron/main.cjs) y anadi [`electron/preload.cjs`](/c:/Users/User/Desktop/Discord-IFROS/electron/preload.cjs).
- Configure protocolo `umbra://` para callbacks de auth desktop.
- Agregue `electron-builder` a [`package.json`](/c:/Users/User/Desktop/Discord-IFROS/package.json).
- Genere:
  - unpacked build en `release/win-unpacked`
  - instalador en `release/Umbra Setup 0.2.0.exe`

### 5. Supabase

- Actualice [`supabase/schema.sql`](/c:/Users/User/Desktop/Discord-IFROS/supabase/schema.sql).
- Agregue `profiles.auth_user_id`, `profiles.email`, `profiles.email_confirmed_at`, `profiles.auth_provider`.
- Agregue `guilds.is_default`.
- Reemplace [`server/seed-data.js`](/c:/Users/User/Desktop/Discord-IFROS/server/seed-data.js) para que los usuarios nuevos entren con servidores base.
- Arregle [`scripts/bootstrap-supabase.js`](/c:/Users/User/Desktop/Discord-IFROS/scripts/bootstrap-supabase.js) para recargar el cache de schema de PostgREST.

## Verificaciones ejecutadas

- `npm install`
- `npm run build`
- `npm run setup:supabase`
- smoke test contra Supabase Auth y backend:
  - crear usuario real
  - login con password
  - `/api/bootstrap`
  - crear mensaje
  - editar mensaje
  - reaccionar
  - borrar mensaje
- `npm run pack:desktop`
- `npm run build:desktop`

## Riesgo residual conocido

- El instalador y el build unpacked se generaron correctamente.
- No pude validar visualmente la GUI ya empaquetada desde este entorno de shell porque el proceso desktop no expone una forma fiable de inspeccion aqui.
- Si al probar el `.exe` fuera del repo notas que no conecta, revisa primero:
  - presencia de `.env` externo si quieres modo local privado
  - o configuracion a backend remoto si vas a distribucion publica

## Lo que quedo pendiente por accesos externos

### Repo GitHub `Umbra`

No pude crear ni subir el repo a tu cuenta porque en esta maquina no hay autenticacion utilizable de GitHub ni `gh` instalado/autenticado.

Pasos para cerrarlo:

1. Crea un repo vacio llamado `Umbra` en tu cuenta de GitHub.
2. Ejecuta:
   - `git remote add origin https://github.com/TU_USUARIO/Umbra.git`
   - `git push -u origin main`

### Google OAuth real

El flujo en codigo ya quedo preparado, pero falta activar el proveedor en el dashboard de Supabase con credenciales de Google.

Pasos:

1. En Supabase Auth habilita Google.
2. Carga `Client ID` y `Client Secret` desde Google Cloud.
3. Agrega redirect URLs:
   - web: tu dominio final
   - desktop: `umbra://auth/callback`

### Desktop de produccion

La build instalable ya sale, pero para una version publica no recomiendo incrustar `SUPABASE_SERVICE_ROLE_KEY` dentro del instalador.

Opciones correctas:

1. Desplegar el backend y compilar el desktop apuntando a ese backend remoto.
2. O ejecutar el backend local solo en entorno interno con variables externas, nunca embebiendo el secreto en el binario.

### Icono propio

`electron-builder` uso el icono por defecto de Electron porque no habia `icon.ico`.

Para completarlo:

1. agrega `build/icon.ico`
2. vuelve a correr `npm run build:desktop`

## Estado final

- Web lista para deploy tecnico.
- Backend autenticado y endurecido.
- Base lista en Supabase.
- Desktop instalable generado.
- Push a GitHub y activacion final de Google dependen de accesos externos.
