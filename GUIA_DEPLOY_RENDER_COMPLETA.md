# Guia completa para subir Umbra a Render y dejarla funcionando en internet

## Objetivo

Publicar Umbra en una URL publica para que:

- el frontend y el backend vivan en el mismo dominio
- Socket.IO funcione en tiempo real desde internet
- Supabase Auth funcione con email, OTP y Google
- la app pueda usarse desde distintas ubicaciones sin depender de `localhost`

Esta guia asume el estado actual del proyecto:

- backend Node + Express + Socket.IO
- frontend Vite servido por el backend en produccion
- deploy recomendado con [`render.yaml`](/c:/Users/User/Desktop/Discord-IFROS/render.yaml)
- auth con Supabase

## Resumen corto

1. Subir el repo `Umbra` a GitHub.
2. Crear el servicio en Render desde ese repo.
3. Cargar variables de entorno correctas.
4. Actualizar Supabase Auth con el dominio final.
5. Activar Google en Supabase y configurar Google Cloud.
6. Verificar login, mensajes y sockets en la URL publica.

## Antes de empezar

### 1. Rotar secretos si estuvieron expuestos

Si tus claves estuvieron visibles en archivos como `Links.md`, rota antes de ir a produccion:

- `SUPABASE_SERVICE_ROLE_KEY`
- password de base de datos si la compartiste
- cualquier otro secreto expuesto

Haz esto primero para no publicar credenciales comprometidas.

### 2. Confirmar que Supabase ya tiene schema y seed

La base actual ya deberia tener:

- tablas del schema de [`supabase/schema.sql`](/c:/Users/User/Desktop/Discord-IFROS/supabase/schema.sql)
- seed inicial de Umbra

Si no estas seguro, corre localmente:

```powershell
npm run setup:supabase
```

### 3. Entender que hoy no hacen falta buckets

Umbra hoy no usa Supabase Storage para archivos reales.

- `storage.listBuckets()` devuelve `0`
- eso no rompe mensajes ni auth
- solo necesitaras buckets cuando implementemos upload real

Buckets recomendados para el futuro:

- `avatars`
- `attachments`

## Paso 1. Subir el repo a GitHub

Render despliega muy bien desde GitHub. Si todavia no existe el repo remoto:

1. Crea un repo vacio llamado `Umbra` en GitHub.
2. Desde la raiz del proyecto ejecuta:

```powershell
git remote add origin https://github.com/TU_USUARIO/Umbra.git
git push -u origin main
```

Si ya tienes remoto:

```powershell
git push
```

## Paso 2. Crear el servicio en Render

Render ya esta preparado en este proyecto con [`render.yaml`](/c:/Users/User/Desktop/Discord-IFROS/render.yaml).

### Opcion recomendada: Blueprint

1. Entra a Render.
2. Pulsa `New`.
3. Elige `Blueprint`.
4. Conecta tu repo `Umbra`.
5. Render detectara `render.yaml`.
6. Crea el servicio.

### Lo que ya toma Render desde `render.yaml`

- tipo `web`
- runtime `node`
- plan `free`
- `buildCommand`: `npm install --include=dev && npm run build`
- `startCommand`: `npm start`
- health check: `/api/health`

## Paso 3. Variables de entorno en Render

Configura estas variables en el servicio.

### Obligatorias

- `PUBLIC_APP_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Recomendadas

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `RATE_LIMIT_MAX=1200`

### Opcionales

- `ALLOWED_ORIGINS`
- `SUPABASE_DB_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Valores exactos sugeridos

#### Si al principio usas solo el subdominio de Render

Ejemplo de dominio:

```text
https://umbra.onrender.com
```

Variables:

```text
PUBLIC_APP_URL=https://umbra.onrender.com
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
NODE_ENV=production
HOST=0.0.0.0
RATE_LIMIT_MAX=1200
```

### Variables que NO deberias poner para este deploy

No definas estas dos si frontend y backend viven en el mismo dominio:

- `VITE_API_URL`
- `VITE_SOCKET_URL`

Dejalas vacias o no las crees. El cliente ya cae a rutas relativas y al mismo origen.

### Sobre `ALLOWED_ORIGINS`

Con este proyecto, si defines `PUBLIC_APP_URL`, el backend ya acepta ese origen automaticamente.

Usa `ALLOWED_ORIGINS` solo si necesitas varios dominios, por ejemplo:

```text
ALLOWED_ORIGINS=https://umbra.onrender.com,https://chat.tudominio.com
```

## Paso 4. Primer deploy y URL publica

Una vez creado el servicio:

1. Lanza el primer deploy.
2. Espera a que Render lo marque como `Live`.
3. Abre:

```text
https://TU-URL/api/health
```

Deberias ver algo como:

```json
{"ok":true,"mode":"supabase"}
```

Si eso responde, backend y conexion a Supabase estan vivos.

## Paso 5. Configurar Supabase Auth para el dominio publico

Esto es obligatorio para que login, OTP y Google funcionen bien en internet.

En Supabase Dashboard:

1. Ve a `Authentication`.
2. Abre `URL Configuration`.
3. Configura:

### Site URL

```text
https://umbra.onrender.com
```

o tu dominio final:

```text
https://chat.tudominio.com
```

### Redirect URLs

Agrega al menos:

```text
https://umbra.onrender.com
https://umbra.onrender.com/*
```

Si luego usas dominio propio, agrega tambien:

```text
https://chat.tudominio.com
https://chat.tudominio.com/*
```

Si mantendras desktop con OAuth, conserva tambien:

```text
umbra://auth/callback
```

## Paso 6. Configurar Google Login correctamente

Umbra ya tiene el flujo en codigo, pero Google debe quedar activado en Supabase y en Google Cloud.

### En Supabase

1. Ve a `Authentication`.
2. Abre `Providers`.
3. Activa `Google`.
4. Copia el callback URL que Supabase te muestra.

### En Google Cloud

1. Crea o reutiliza un proyecto.
2. Configura la pantalla de consentimiento.
3. Crea un `OAuth Client ID` de tipo `Web application`.
4. En `Authorized JavaScript origins` agrega:

```text
https://umbra.onrender.com
```

o tu dominio final:

```text
https://chat.tudominio.com
```

5. En `Authorized redirect URIs` pega exactamente el callback URL que muestra Supabase para Google.
6. Copia `Client ID` y `Client Secret`.
7. Pega esos valores en el provider de Google dentro de Supabase.

### Importante

No pongas `umbra://auth/callback` como redirect URI en Google Cloud para la web de Render.
El redirect de Google debe ir al callback de Supabase.
El deep link `umbra://auth/callback` se usa para desktop.

## Paso 7. Dominio propio y HTTPS

Puedes salir primero con `onrender.com` y luego pasar a dominio propio.

Cuando quieras dominio final:

1. En Render abre el servicio.
2. Ve a `Settings`.
3. Agrega `Custom Domain`.
4. Sigue las instrucciones DNS de Render.
5. Espera la verificacion.
6. Cuando quede activo, Render gestiona TLS automaticamente.

Despues:

1. cambia `PUBLIC_APP_URL` al dominio propio
2. actualiza `Site URL` y `Redirect URLs` en Supabase
3. si hace falta, agrega `ALLOWED_ORIGINS` con ambos dominios temporalmente

## Paso 8. Verificaciones obligatorias despues del deploy

Haz estas pruebas en la URL publica:

### Basicas

1. Abrir la home.
2. Ver que cargue la pantalla de acceso.
3. Abrir `api/health`.

### Auth

1. Crear cuenta con email/password.
2. Probar login con password.
3. Probar envio de OTP por correo.
4. Probar acceso con Google.
5. Confirmar que la sesion persiste al recargar.

### Realtime

1. Abrir Umbra en dos navegadores distintos.
2. Entrar con dos usuarios diferentes.
3. Enviar mensajes en el mismo canal.
4. Confirmar reacciones en tiempo real.
5. Confirmar presencia y typing indicator.

### Datos

1. Crear un DM.
2. Crear un mensaje.
3. Editarlo.
4. Eliminarlo.
5. Recargar y confirmar persistencia.

## Paso 9. Ajustes para 100 personas aprox

Para un primer despliegue serio con alrededor de 100 usuarios:

- empieza con `plan: standard` en Render
- mantén una sola instancia al principio
- usa el mismo dominio para frontend y backend
- monitorea uso de memoria, CPU y reconexiones Socket.IO

### Cuando considerar el siguiente salto

Si ya tienes concurrencia alta real:

- varias salas activas al mismo tiempo
- muchos sockets simultaneos
- picos de mensajes y presencia

entonces el siguiente paso sera:

1. mover a varias instancias
2. poner un adapter compartido para Socket.IO
3. agregar observabilidad
4. separar assets y uploads si implementamos archivos

## Paso 10. Lo que NO debes hacer

- no subas `SUPABASE_SERVICE_ROLE_KEY` al frontend
- no pongas secretos en el repo
- no dejes `VITE_API_URL=http://localhost:3030` en produccion
- no dejes `VITE_SOCKET_URL=http://localhost:3030` en produccion
- no cambies el deploy a `static site`; Umbra debe ir como `web service`

## Paso 11. Si algo falla

### La app carga pero no inicia sesion

Revisa:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `Site URL`
- `Redirect URLs`

### El backend responde pero el frontend no conecta por socket

Revisa:

- que el servicio sea `web service`
- que `PUBLIC_APP_URL` sea correcta
- que no hayas forzado `VITE_SOCKET_URL` a localhost
- que el navegador no este bloqueado por origen no permitido

### Google abre pero no vuelve a la app

Revisa:

- callback URL copiada desde Supabase en Google Cloud
- `Site URL` correcta en Supabase
- dominio final correcto en Render

### OTP envia correo pero no entra

Revisa:

- `Redirect URLs` en Supabase
- que el enlace del correo apunte al dominio publico correcto

## Checklist final

- repo `Umbra` subido a GitHub
- servicio creado en Render desde `render.yaml`
- variables cargadas
- `api/health` respondiendo
- `Site URL` y `Redirect URLs` configuradas en Supabase
- Google activado y probado
- login, OTP y mensajes probados en la URL publica
- dominio propio configurado si aplica

## Archivos del proyecto que intervienen

- [`render.yaml`](/c:/Users/User/Desktop/Discord-IFROS/render.yaml)
- [`.env.example`](/c:/Users/User/Desktop/Discord-IFROS/.env.example)
- [`server/start-server.js`](/c:/Users/User/Desktop/Discord-IFROS/server/start-server.js)
- [`src/api.js`](/c:/Users/User/Desktop/Discord-IFROS/src/api.js)
- [`src/socket.js`](/c:/Users/User/Desktop/Discord-IFROS/src/socket.js)
- [`src/supabase-browser.js`](/c:/Users/User/Desktop/Discord-IFROS/src/supabase-browser.js)

## Documentacion oficial util

- Render Web Services: https://render.com/docs/web-services
- Render Blueprints: https://render.com/docs/infrastructure-as-code
- Render WebSockets: https://render.com/docs/websocket
- Render Custom Domains: https://render.com/docs/custom-domains
- Supabase Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase Google Login: https://supabase.com/docs/guides/auth/social-login/auth-google
