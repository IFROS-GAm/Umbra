# Umbra

Arriba como abajo. Chat with shadows.

Umbra es una app de chat estilo mini-Discord con frontend React + Vite, backend Express + Socket.IO, autenticacion con Supabase y empaquetado desktop con Electron.

## Stack

- React 18 + Vite
- Express + Socket.IO
- Supabase Auth + Postgres
- Electron + electron-builder

## Funciones principales

- servidores, canales y DMs
- mensajes, replies, edicion, borrado y reacciones
- presencia, typing indicator y lectura por canal
- login con email y password
- OTP por codigo de verificacion
- flujo preparado para Google OAuth
- build web y build desktop instalable

## Scripts

- `npm run dev`
- `npm run build`
- `npm run setup:supabase`
- `npm run pack:desktop`
- `npm run build:desktop`

## Archivos clave

- frontend: `src/`
- backend: `server/`
- electron: `electron/`
- schema: `supabase/schema.sql`
- deploy web: `GUIA_DEPLOY_RENDER_COMPLETA.md`
