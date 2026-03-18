# Guía de Deploy a Hostinger

## Archivos Necesarios

### 1. Archivos del Frontend (dist/)
Subir todo el contenido de la carpeta `dist/` al directorio `public_html/` de Hostinger:

```
public_html/
├── .htaccess          # Configuración Apache para SPA
├── index.html         # Entry point de la aplicación
├── manifest.webmanifest
├── sw.js
├── workbox-*.js
└── assets/
    ├── index-*.js
    ├── index-*.css
    └── workbox-window.prod.es5-*.js
```

### 2. Backend (Node.js)
Subir estos archivos al directorio raíz (fuera de public_html) o a una carpeta como `api/`:

```
~/ (raíz del hosting)
├── server.ts          # Código fuente del servidor
├── package.json       # Dependencias
├── package-lock.json
├── node_modules/      # Instalado en el servidor
└── .env               # Variables de entorno (VER ABAJO)
```

## Variables de Entorno (.env)

Crear archivo `.env` en el servidor con:

```bash
# Server
SESSION_SECRET=tu_secreto_aleatorio_32_chars
NODE_ENV=production
APP_URL=https://me.mima-app.com

# Gemini AI
GEMINI_API_KEY=tu_api_key_de_google_ai

# Google OAuth
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret

# ElevenLabs TTS
ELEVENLABS_API_KEY=tu_api_key_elevenlabs

# Supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

## Instrucciones de Deploy

### Paso 1: Subir archivos
1. Subir contenido de `dist/` a `public_html/`
2. Subir `server.ts`, `package.json`, `package-lock.json` a raíz

### Paso 2: Instalar dependencias en Hostinger
```bash
cd ~/
npm install --production
```

### Paso 3: Compilar TypeScript
```bash
npx tsc server.ts --outDir dist-server --esModuleInterop --target ES2022 --module commonjs --moduleResolution node
```

### Paso 4: Iniciar servidor con PM2
```bash
npm install -g pm2
pm2 start dist-server/server.js --name "mima-app"
pm2 save
pm2 startup
```

### Paso 5: Configurar dominio
Asegurar que `me.mima-app.com` apunte al servidor de Hostinger.

## Funcionalidades Implementadas

### Fase 1 ✅
- ✅ Modelo Gemini corregido (gemini-1.5-flash-latest)
- ✅ Enrutador inteligente Flash/Pro según complejidad
- ✅ Respuestas en idioma del usuario (fi/sv/es/en)
- ✅ Mensajes de error localizados

### Fase 2 ✅ (Function Calling)
- ✅ Crear eventos: "Crea una reunión mañana a las 3pm"
- ✅ Listar eventos: "Qué tengo esta semana?"
- ✅ Buscar eventos: "Busca mis reuniones" 
- ✅ Eliminar eventos: "Elimina mi reunión de mañana"
- ✅ Actualizar eventos: "Mueve mi reunión al martes"

## Testing Post-Deploy

1. **Chat básico**: "Hola, ¿cómo estás?"
2. **Idioma**: Verificar respuesta en español/finlandés
3. **Calendario - Crear**: "Crea un evento llamado Test mañana a las 5pm"
4. **Calendario - Listar**: "Muéstrame mis eventos de hoy"
5. **Calendario - Buscar**: "Busca eventos con la palabra reunión"
6. **Business Mode**: "Analiza mi productividad" (debe usar Pro model)

## Troubleshooting

### Error 500 en API
```bash
pm2 logs mima-app
```

### Problemas de OAuth
Verificar que las URIs de redirección estén registradas en Google Cloud Console:
- `https://me.mima-app.com/api/auth/callback/google`

### Problemas de CORS
Verificar que APP_URL coincida exactamente con el dominio usado.

### Calendario no funciona
El usuario debe conectar Google Calendar primero en la sección Calendar.
