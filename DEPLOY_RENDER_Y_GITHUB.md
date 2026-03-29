# Deploy real: Render y GitHub

## Lo que ya deje preparado

- [`render.yaml`](/c:/Users/User/Desktop/Discord-IFROS/render.yaml) para desplegar Umbra como un solo servicio web en Render.
- [`server/start-server.js`](/c:/Users/User/Desktop/Discord-IFROS/server/start-server.js) actualizado para aceptar `PUBLIC_APP_URL` o `RENDER_EXTERNAL_URL` como origen valido en produccion.
- [`package.json`](/c:/Users/User/Desktop/Discord-IFROS/package.json) ya listo con:
  - `npm run build`
  - `npm start`
- El backend ya sirve el frontend compilado, asi que Render puede levantar todo en una sola app.

## Lo que no pude hacer desde aqui

No pude crear ni subir el repo remoto a GitHub ni crear el servicio en Render porque en esta maquina no hay:

- `gh`
- CLI de Render
- token de GitHub
- token de Render

## GitHub: pasos exactos

1. Crea un repo vacio llamado `Umbra`.
2. Desde este repo ejecuta:

```powershell
git remote add origin https://github.com/TU_USUARIO/Umbra.git
git push -u origin main
```

## Render: pasos exactos

### Opcion recomendada

1. Entra a Render.
2. Crea un nuevo `Blueprint` o `Web Service` desde el repo `Umbra`.
3. Si usas Blueprint, Render tomara [`render.yaml`](/c:/Users/User/Desktop/Discord-IFROS/render.yaml).

### Variables obligatorias

- `PUBLIC_APP_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Valores sugeridos

- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `RATE_LIMIT_MAX=1200`

### Build y start

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check: `/api/health`

## Nota para 100 personas aprox

Para alrededor de 100 usuarios repartidos en varias zonas:

- una sola instancia `standard` de Render deberia aguantar una primera salida seria si la concurrencia real no es extrema
- Render funciona bien para salir rapido con Socket.IO en una sola instancia
- si despues tienes bastante concurrencia simultanea y mucho trafico realtime, el siguiente paso natural sera:
  - mover el backend a mas de una instancia
  - agregar un adapter compartido para Socket.IO
  - poner un dominio final y observabilidad

## Riesgos o pendientes antes de abrirlo al publico

- Google OAuth sigue necesitando activacion real en Supabase.
- El icono de la app desktop sigue siendo el default de Electron.
- No recomiendo distribuir un desktop publico con `SUPABASE_SERVICE_ROLE_KEY` embebida; para desktop publico usa backend remoto.

## Verificacion minima despues del deploy

1. Abre `https://TU_DOMINIO/api/health`
2. Debe responder con `ok: true`
3. Entra a la app y prueba:
   - signup
   - login
   - crear mensaje
   - abrir un DM
   - reaccionar

## Si quieres que lo deje 100% online en la siguiente vuelta

Solo necesito una de estas dos cosas:

1. acceso autenticado a GitHub y Render en esta maquina
2. o que tu crees el repo y el servicio vacio, y me pases:
   - URL del repo
   - URL del servicio Render
   - variables ya cargadas

Con eso yo te dejo el deploy cerrado y validado sobre la URL real.
