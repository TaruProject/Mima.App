# Guia de deploy a Hostinger

## Estrategia soportada

La app se despliega en dos partes:

1. `public_html/` contiene el frontend compilado (`dist/`).
2. La raiz del dominio contiene el backend compilado (`dist-server/`), `app.js`, `package.json`, `.env` y `node_modules/`.

`app.js` es el bootstrap que Passenger debe arrancar. Primero intenta cargar `dist-server/server.js` y solo usa `tsx server.ts` como fallback de emergencia.

## Build local recomendado

```bash
npm install
npm run build
```

Eso genera:

- `dist/` para el frontend
- `dist-server/` para el backend

## Archivos a subir

### En la raiz del dominio

```text
/home/u482312211/domains/me.mima-app.com/
  app.js
  package.json
  package-lock.json
  .env
  dist-server/
  node_modules/
```

### En `public_html/`

Sube el contenido de `dist/` junto con `.htaccess`.

## Variables de entorno

```bash
NODE_ENV=production
APP_URL=https://me.mima-app.com
SESSION_SECRET=tu_secreto_aleatorio_32_chars

GEMINI_API_KEY=tu_api_key_de_google_ai

GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret

ELEVENLABS_API_KEY=tu_api_key_elevenlabs

VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

## Configuracion de Hostinger

La configuracion de Passenger debe apuntar a:

- `PassengerAppRoot /home/u482312211/domains/me.mima-app.com`
- `PassengerStartupFile app.js`

El `.htaccess` del repo ya viene preparado para esto.

## Base de datos

Aplica las migraciones de `supabase/migrations/` antes del deploy productivo. La app necesita:

- `profiles`
- `user_preferences`
- `chat_messages`
- `user_google_tokens`

## Checklist de validacion

1. `GET /api/health`
2. `GET /api/health-detailed`
3. Login con Supabase
4. Guardado de perfil
5. Conectar Google Calendar / Gmail
6. Enviar un mensaje al chat

## Troubleshooting

### 503 al arrancar

Verifica que exista `dist-server/server.js` en la raiz del dominio y que Passenger este arrancando `app.js`.

### OAuth de Google

Las redirect URIs deben incluir:

- `https://me.mima-app.com/api/auth/callback/google`
- `https://me.mima-app.com/auth/callback/google`

### Frontend carga pero la API no responde

Confirma que `.htaccess` no este reescribiendo rutas `/api/*` a `index.html`.
