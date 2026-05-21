# ARCHITECTURE.md — Mima App v2.0

> Mapa técnico completo del sistema. Complementa `AGENTS.md`.
> Última actualización: 2026-04-20 | Basado en auditoría completa del código fuente.

---

## 1. Resumen Ejecutivo

**Mima** es un asistente personal de IA multilingüe desplegado como PWA. Centraliza chat (Gemini 2.5), Google Calendar (CRUD), Gmail (lectura + borradores seguros), voz (ElevenLabs TTS/STT), memorias persistentes y tareas en una interfaz conversacional.

| Campo                    | Valor                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| **Estado**               | ~60% completado — funcional en español, roto en fi/sv                   |
| **Bloqueador principal** | Localización del backend (system prompts y format responses en español) |
| **Mercado objetivo**     | 🇫🇮 Finlandia (primario), 🇸🇪 Suecia (secundario)                         |
| **Hosting**              | Hostinger ( Passenger + `app.js` bootstrap)                             |
| **Dominio**              | `https://me.mima-app.com`                                               |

---

## 2. Stack Tecnológico

| Layer                  | Tecnología                | Versión            | Estado                                             |
| ---------------------- | ------------------------- | ------------------ | -------------------------------------------------- |
| **Frontend Framework** | React                     | ^19.0.0            | ✅ Activo                                          |
| **Build Tool**         | Vite                      | ^6.2.0             | ✅ Activo                                          |
| **Language**           | TypeScript                | ~5.8.2             | ✅ Activo                                          |
| **Styling**            | Tailwind CSS              | ^4.1.14            | ✅ Activo (v4 @theme)                              |
| **Routing**            | react-router-dom          | ^7.13.1            | ✅ Activo                                          |
| **Animations**         | motion (Framer Motion)    | ^12.23.24          | ✅ Activo                                          |
| **i18n**               | i18next + react-i18next   | ^25.8.18 / ^16.5.8 | ⚠️ Parcial — frontend OK, backend sin localización |
| **Icons**              | lucide-react              | ^0.546.0           | ✅ Activo                                          |
| **Markdown**           | react-markdown            | ^10.1.0            | ✅ Activo                                          |
| **PWA**                | vite-plugin-pwa (Workbox) | ^1.2.0             | ✅ Activo                                          |
| **Backend**            | Express                   | ^4.21.2            | ✅ Activo                                          |
| **Session**            | express-session           | ^1.19.0            | ⚠️ MemoryStore (no prod-ready)                     |
| **Upload**             | multer                    | ^2.1.1             | ✅ Activo                                          |
| **Auth**               | @supabase/supabase-js     | ^2.98.0            | ✅ Activo                                          |
| **AI**                 | @google/genai (Gemini)    | ^1.29.0            | ✅ Activo                                          |
| **Google APIs**        | googleapis                | ^171.4.0           | ✅ Activo                                          |
| **TTS**                | ElevenLabs REST API       | via proxy          | ✅ Activo                                          |
| **Date parsing**       | chrono-node               | ^2.9.0             | ✅ Activo                                          |
| **Lint**               | ESLint 9 (flat config)    | ^9.39.4            | ✅ Activo                                          |
| **Formatter**          | Prettier                  | ^3.8.1             | ✅ Activo                                          |
| **Tests**              | —                         | —                  | ❌ Ningún framework                                |

---

## 3. Estructura del Repositorio

```
Mima.App/
├── server.ts                          # Backend monolítico (5573 líneas)
├── app.js                             # Bootstrap Hostinger Passenger
├── index.html                         # SPA entry + meta tags PWA
├── package.json                       # Dependencies + scripts
├── tsconfig.json                      # Frontend TS config (ES2022, noEmit)
├── tsconfig.server.json               # Backend TS config (NodeNext, dist-server/)
├── vite.config.ts                     # Vite + React + Tailwind + PWA
├── eslint.config.js                   # ESLint 9 flat config (activo)
├── .eslintrc.json                     # Legacy ESLint (⚠️ eliminar)
├── .prettierrc                        # Prettier config
├── supabase-migration.sql             # Legacy migration (5 tablas + RLS)
├── supabase/
│   └── migrations/
│       ├── 20260316000000_create_profiles.sql
│       └── 20260323000000_create_app_data_tables.sql
├── scripts/
│   ├── check-i18n.js                  # Verifica keys simétricas en 4 locales
│   ├── write-build-info.cjs           # Genera src/generated/buildInfo.ts
│   └── write-server-package.cjs       # Copia package.json a dist-server/
├── public/
│   ├── logo.jpg
│   ├── assets/
│   └── .htaccess
└── src/
    ├── main.tsx                       # React root + PWA SW registration
    ├── App.tsx                        # Router + ProtectedRoute + PWA update
    ├── index.css                      # Tailwind v4 + Google Fonts
    ├── vite-env.d.ts                  # Vite type declarations
    ├── generated/
    │   └── buildInfo.ts               # Auto-generated build metadata
    ├── pages/
    │   ├── Auth.tsx                   # Login/Signup (Supabase)
    │   ├── Chat.tsx                   # Chat principal (1043 líneas)
    │   ├── Calendar.tsx               # Vista calendario mensual
    │   ├── Inbox.tsx                  # Gmail UI
    │   ├── Profile.tsx                # Ajustes, voz, idioma, Google
    │   └── GoogleCallback.tsx         # Procesa redirect OAuth
    ├── components/
    │   ├── Layout.tsx                 # Navegación inferior
    │   ├── ErrorBoundary.tsx          # Catch errores de render
    │   ├── InstallPWA.tsx             # Prompt instalación PWA
    │   ├── UpdateOverlay.tsx          # Overlay actualización obligatoria
    │   ├── ProductivitySnapshot.tsx   # ⚠️ No importado en ninguna página
    │   ├── onboarding/
    │   │   └── OnboardingFlow.tsx     # 4 steps (0-3)
    │   └── ui/
    │       ├── ActionMenu.tsx         # Menú acciones chat
    │       ├── ModeBottomSheet.tsx    # Selector modo IA
    │       └── Toast.tsx              # Notificaciones toast
    ├── contexts/
    │   ├── AuthContext.tsx            # Supabase auth provider
    │   └── ToastContext.tsx           # Toast provider
    ├── hooks/
    │   ├── useAudioPlayback.ts        # Reproducción TTS + fallback iOS
    │   ├── useGoogleConnection.ts     # Estado conexión Google + OAuth
    │   ├── useToast.ts               # Toast hook
    │   └── useVoiceRecording.ts      # Grabación + transcripción
    ├── services/                      # ⚠️ userPreferences/Memory/Task son backend-only
    │   ├── geminiService.ts           # Chat + TTS wrapper (funciona en frontend)
    │   ├── userPreferencesService.ts  # ⚠️ process.env + node:crypto (roto en browser)
    │   ├── userMemoryService.ts       # ⚠️ process.env + node:crypto (roto en browser)
    │   └── userTaskService.ts         # ⚠️ process.env + node:crypto (roto en browser)
    ├── lib/
    │   └── supabase.ts               # Supabase client singleton
    ├── constants/
    │   └── voices.ts                  # 16 voces + DEFAULT_VOICE_ID
    ├── config/
    │   └── mimaStyles.ts              # 5 modos IA + system prompts (ES)
    └── i18n/
        ├── index.ts                   # i18next config
        └── locales/
            ├── en/common.json          # 220 keys
            ├── es/common.json          # 220 keys
            ├── fi/common.json          # 220 keys (⚠️ diacríticos faltantes)
            └── sv/common.json          # 220 keys (⚠️ diacríticos faltantes)
```

---

## 4. Base de Datos / Estado de Datos

### ERD (Entity Relationship Diagram)

```
auth.users (Supabase Auth)
    │
    ├── 1:1 → profiles (id → id)
    ├── 1:1 → user_preferences (id → user_id)
    ├── 1:1 → user_google_tokens (id → user_id)
    ├── 1:N → chat_messages (id → user_id)
    ├── 1:N → user_memories (id → user_id)
    └── 1:N → user_tasks (id → user_id)
```

### Tablas Detalladas

#### `profiles`

| Columna      | Tipo        | Restricción         | Notas                   |
| ------------ | ----------- | ------------------- | ----------------------- |
| `id`         | UUID        | PK, FK → auth.users | Auto-creada por trigger |
| `name`       | TEXT        | nullable            | —                       |
| `username`   | TEXT        | UNIQUE, nullable    | —                       |
| `language`   | TEXT        | DEFAULT 'en'        | —                       |
| `voice_id`   | TEXT        | nullable            | —                       |
| `avatar_url` | TEXT        | nullable            | —                       |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW()       | —                       |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW()       | Auto-update trigger     |

RLS: SELECT público (anyone can see), INSERT/UPDATE propio (auth.uid() = id).

#### `user_preferences`

| Columna                  | Tipo        | Restricción                    | Notas                          |
| ------------------------ | ----------- | ------------------------------ | ------------------------------ |
| `user_id`                | UUID        | PK, FK → auth.users            | —                              |
| `onboarding_done`        | BOOLEAN     | DEFAULT false                  | —                              |
| `voice_id`               | TEXT        | DEFAULT 'DODLEQrClDo8wCz460ld' | —                              |
| `language`               | TEXT        | DEFAULT 'en'                   | —                              |
| `last_daily_briefing_at` | TIMESTAMPTZ | nullable                       | Solo en supabase-migration.sql |
| `created_at`             | TIMESTAMPTZ | DEFAULT NOW()                  | —                              |
| `updated_at`             | TIMESTAMPTZ | DEFAULT NOW()                  | Auto-update trigger            |

RLS: SELECT/UPDATE/INSERT propio (auth.uid() = user_id).

⚠️ **VERIFY**: `RE_AUDITORIA_CRITICA.md` reporta que la DB real tiene columnas `id`, `personality_mode` en vez de `user_id`, `onboarding_done`. Confirmar estado actual.

#### `chat_messages`

| Columna      | Tipo        | Restricción                   |
| ------------ | ----------- | ----------------------------- |
| `id`         | UUID        | PK, DEFAULT gen_random_uuid() |
| `user_id`    | UUID        | FK → auth.users, NOT NULL     |
| `role`       | TEXT        | CHECK (user/assistant/system) |
| `content`    | TEXT        | NOT NULL                      |
| `mode`       | TEXT        | DEFAULT 'Neutral Mode'        |
| `audio_data` | TEXT        | nullable                      |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW()                 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW()                 |

RLS: CRUD propio (auth.uid() = user_id).

#### `user_google_tokens`

| Columna      | Tipo        | Restricción                      |
| ------------ | ----------- | -------------------------------- |
| `user_id`    | UUID        | PK, FK → auth.users              |
| `tokens`     | TEXT        | NOT NULL (AES-256-CBC encrypted) |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW()                    |

RLS: ⚠️ DROP de policies sin recrear. Solo accesible via service role key.

#### `user_memories`

| Columna       | Tipo        | Restricción                   |
| ------------- | ----------- | ----------------------------- |
| `id`          | UUID        | PK, DEFAULT gen_random_uuid() |
| `user_id`     | UUID        | FK → auth.users, NOT NULL     |
| `memory_key`  | TEXT        | UNIQUE, NOT NULL              |
| `memory_text` | TEXT        | NOT NULL                      |
| `category`    | TEXT        | nullable                      |
| `created_at`  | TIMESTAMPTZ | DEFAULT NOW()                 |
| `updated_at`  | TIMESTAMPTZ | DEFAULT NOW()                 |

RLS: CRUD propio (auth.uid() = user_id).

#### `user_tasks`

| Columna        | Tipo        | Restricción                            |
| -------------- | ----------- | -------------------------------------- |
| `id`           | UUID        | PK, DEFAULT gen_random_uuid()          |
| `user_id`      | UUID        | FK → auth.users, NOT NULL              |
| `task_key`     | TEXT        | UNIQUE, NOT NULL                       |
| `title`        | TEXT        | NOT NULL                               |
| `status`       | TEXT        | DEFAULT 'open', CHECK (open/completed) |
| `source_text`  | TEXT        | nullable                               |
| `due_at`       | TIMESTAMPTZ | nullable                               |
| `completed_at` | TIMESTAMPTZ | nullable                               |
| `created_at`   | TIMESTAMPTZ | DEFAULT NOW()                          |
| `updated_at`   | TIMESTAMPTZ | DEFAULT NOW()                          |

RLS: CRUD propio (auth.uid() = user_id).

### Estrategia de Encriptación

```
SESSION_SECRET (env var)
    ↓
scryptSync(secret, 'salt', 32)  ← ⚠️ salt estático (BUG-002)
    ↓
AES-256-CBC key (32 bytes)
    ↓
encrypt(text) → Base64 ciphertext → Supabase user_google_tokens.tokens
decrypt(ciphertext) → plaintext OAuth tokens
```

### Almacenamiento No-DB

| Dato                  | Storage                 | Razón                             |
| --------------------- | ----------------------- | --------------------------------- |
| Voice ID              | Supabase + localStorage | Doble: backend + rápido acceso UI |
| Language              | Supabase + localStorage | Doble: persistencia + i18n init   |
| Onboarding done       | localStorage            | Per-device, no sincroniza         |
| Chat reset flag       | localStorage            | Control de flujo UI               |
| Gemini client         | In-memory               | Re-init cada restart con retry    |
| Google tokens (cache) | Express session         | Evita DB query por request        |

---

## 5. Backend / Integraciones

### Flujo de Datos Principal (Request → Response)

```
Browser → fetch('/api/chat', { Authorization: Bearer <jwt> })
    ↓
Express (server.ts)
    ↓
authenticateSupabaseUser middleware
    → supabase.auth.getUser(token) → req.user
    ↓
POST /api/chat handler
    ├── Pre-processing: memory/task/briefing/time intents
    ├── Model selection: selectModelForTask()
    ├── System prompt construction (mode + language + context)
    ├── Gemini API call: ai.models.generateContent()
    ├── Response parsing: extractToolPayload()
    ├── Tool execution: executeGoogleToolCall()
    │   ├── getUserTokens(req) → session or Supabase
    │   ├── Google Calendar API (via googleapis)
    │   └── Gmail API (via googleapis)
    ├── Follow-up tool calls (if any)
    └── JSON response { text, toolCalls }
```

### Endpoints por Categoría

**Auth & OAuth** — `server.ts:1100-1500`

| Endpoint                        | Auth    | Función Interna                            |
| ------------------------------- | ------- | ------------------------------------------ |
| `GET /api/auth/url`             | Bearer  | Genera Google OAuth consent URL            |
| `GET /api/auth/callback/google` | Session | Intercambia code → tokens → encrypt → save |
| `GET /api/auth/status`          | None    | Estado conexión Google + scopes            |
| `DELETE /api/auth/google`       | Bearer  | Desconecta Google (session + DB)           |

**Chat** — `server.ts:3113-4312`

| Endpoint                   | Auth   | Función Interna                        |
| -------------------------- | ------ | -------------------------------------- |
| `POST /api/chat`           | Bearer | Chat con Gemini + tool calling         |
| `GET /api/chat/history`    | Bearer | Historial (via userPreferencesService) |
| `POST /api/chat/message`   | Bearer | Guardar mensaje                        |
| `DELETE /api/chat/history` | Bearer | Limpiar historial                      |

**Calendar** — `server.ts:1836-2131, 4538-4572`

| Endpoint                   | Auth   | Función Interna                |
| -------------------------- | ------ | ------------------------------ |
| `GET /api/calendar/events` | Bearer | Lista eventos (via googleapis) |

**Gmail** — `server.ts:4574-5259`

| Endpoint                                       | Auth   | Función Interna                     |
| ---------------------------------------------- | ------ | ----------------------------------- |
| `GET /api/gmail/messages`                      | Bearer | Emails no leídos clasificados       |
| `GET /api/gmail/messages/:id`                  | Bearer | Email completo                      |
| `GET /api/gmail/messages/:id/attachments/:aid` | Bearer | Adjunto + análisis IA               |
| `POST /api/gmail/messages/:id/draft-reply-ai`  | Bearer | Genera draft reply con IA           |
| `POST /api/gmail/draft`                        | Bearer | Crea borrador                       |
| `GET /api/gmail/drafts`                        | Bearer | Lista borradores                    |
| `GET /api/gmail/drafts/:id`                    | Bearer | Obtiene borrador                    |
| `PUT /api/gmail/drafts/:id`                    | Bearer | Actualiza borrador                  |
| `POST /api/gmail/drafts/:id/send`              | Bearer | Enviar (requiere confirmSend: true) |
| `DELETE /api/gmail/drafts/:id`                 | Bearer | Elimina borrador                    |

**TTS/STT** — `server.ts:1617-1876`

| Endpoint               | Auth            | Función Interna        |
| ---------------------- | --------------- | ---------------------- |
| `GET /api/tts/preview` | Bearer          | Preview voz ElevenLabs |
| `POST /api/tts`        | Bearer          | Genera audio TTS       |
| `POST /api/transcribe` | Bearer + multer | STT vía Gemini audio   |

**User** — `server.ts:1497-1610`

| Endpoint                     | Auth   | Función Interna                           |
| ---------------------------- | ------ | ----------------------------------------- |
| `GET /api/user/preferences`  | Bearer | Preferencias (via userPreferencesService) |
| `POST /api/user/preferences` | Bearer | Actualizar preferencias                   |
| `GET /api/user/tasks`        | Bearer | Tareas (via userTaskService)              |

**Health/Debug** — `server.ts:859-1190`

| Endpoint                   | Auth | Producción       |
| -------------------------- | ---- | ---------------- |
| `GET /api/ping`            | None | ✅ Siempre       |
| `GET /api/health`          | None | ✅ Siempre       |
| `GET /api/version`         | None | ✅ Siempre       |
| `GET /api/health-detailed` | None | ✅ Siempre       |
| `GET /api/test/gemini*`    | None | ❌ IS_PROD guard |
| `GET /api/debug*`          | None | ⚠️ Parcial       |
| `GET /api/oauth/*`         | None | ⚠️ Sin auth      |

### Funciones Internas Clave (server.ts)

| Función                      | Línea             | Propósito                                   |
| ---------------------------- | ----------------- | ------------------------------------------- |
| `encrypt()` / `decrypt()`    | 143, 151          | AES-256-CBC token encryption                |
| `saveSession()`              | 217               | Session save con retries                    |
| `authenticateSupabaseUser()` | 257               | Auth middleware                             |
| `getUserTokens()`            | 4405              | Token retrieval: session → DB → refresh     |
| `ensureGoogleWriteAccess()`  | 448               | Scope validation antes de writes            |
| `persistGoogleTokens()`      | 418               | Save tokens: session + encrypted DB         |
| `executeGoogleToolCall()`    | 2164              | Dispatch tool calls (calendar/gmail)        |
| `extractToolPayload()`       | 2666              | Parse JSON tool call de LLM text            |
| `buildDailyBriefingText()`   | 777               | Briefing: events + gmail + tasks + memories |
| `selectModelForTask()`       | 3009              | Model routing: flash vs pro                 |
| `parseNaturalDate()`         | 1804              | chrono-node date parsing multi-idioma       |
| `buildSystemPrompt()`        | mimaStyles.ts:361 | Construye prompt completo por modo          |

---

## 6. Frontend

### Rutas y Navegación

```
/auth (público) → Auth.tsx (Login/Signup)
    ↓ session exists
/ (protegido) → Layout.tsx (shell con nav inferior)
    ├── /           → Chat.tsx (principal)
    ├── /calendar   → Calendar.tsx
    ├── /inbox      → Inbox.tsx
    └── /profile    → Profile.tsx

/callbacks (públicos):
    /api/auth/callback/google → GoogleCallback.tsx
    /auth/callback/google    → GoogleCallback.tsx
```

### State Management

No hay librería externa de estado. Se usa React Context + useState:

| Context/Store   | Propósito                                       | Consumers                                      |
| --------------- | ----------------------------------------------- | ---------------------------------------------- |
| `AuthContext`   | session, user, signOut                          | ProtectedRoute, Profile, Chat, Calendar, Inbox |
| `ToastContext`  | showToast(type, message)                        | Layout, hooks                                  |
| Component state | Modalidad IA, mensajes chat, preferencias UI    | Local a cada componente                        |
| localStorage    | voice_id, language, onboarding_done, chat_reset | Persistencia cross-session                     |

### Design System

- **Framework**: Tailwind CSS v4 con `@theme` en `index.css`
- **Colores**: Dark theme primario (`#131117` bg, `#6221dd` accent)
- **Tipografía**: Space Grotesk (Google Fonts)
- **Iconos**: lucide-react
- **Animaciones**: motion (Framer Motion) en onboarding, menús, toasts
- **Responsive**: Mobile-first, optimizado para PWA standalone
- **Componentes UI**: No design system formal; estilos inline con Tailwind

### PWA Configuration

- **Manifest**: Generado por vite-plugin-pwa
- **Service Worker**: Workbox con NetworkFirst (navegación) + CacheFirst (assets)
- **Update Strategy**: autoUpdate + overlay obligatorio
- **Install Prompt**: Componente InstallPWA con detección iOS/Android
- **Icons**: `logo.jpg` (192x192, 512x512) en `/public/`

---

## 7. Auth & Autorización

### Flujo Completo

```
                    ┌─────────────────────────┐
                    │  Supabase Auth          │
                    │  (email/password)       │
                    └──────────┬──────────────┘
                               │ JWT
                    ┌──────────▼──────────────┐
                    │  Frontend (AuthContext)  │
                    │  session → localStorage  │
                    └──────────┬──────────────┘
                               │ Authorization: Bearer <jwt>
                    ┌──────────▼──────────────┐
                    │  Express Middleware      │
                    │  authenticateSupabase   │
                    │  User()                 │
                    └──────────┬──────────────┘
                               │ req.user
                    ┌──────────▼──────────────┐
                    │  API Endpoints           │
                    │  (calendar, gmail, etc.) │
                    └─────────────────────────┘
```

### Google OAuth Flow

```
1. Frontend: GET /api/auth/url → redirect a Google consent
2. Google: user autoriza → redirect a /api/auth/callback/google?code=X&state=Y
3. Backend: intercambia code → tokens
4. Backend: encrypt(tokens) → Supabase user_google_tokens
5. Backend: saveSession(req) → req.session.tokens
6. Backend: redirect a /?google_connected=true
```

**Session Recovery**: Si la sesión Express se pierde entre step 1 y 3, el `state` parameter contiene `google_auth:{userId}` para extraer el userId y continuar.

### Guards y Protección

| Guard                      | Ubicación       | Lógica                                                  |
| -------------------------- | --------------- | ------------------------------------------------------- |
| `ProtectedRoute`           | `App.tsx`       | Verifica `session` de AuthContext; sin sesión → `/auth` |
| `authenticateSupabaseUser` | `server.ts:257` | Valida JWT → fallback session.userId → req.user         |
| `ensureGoogleWriteAccess`  | `server.ts:448` | Verifica scopes de escritura antes de modify            |
| `IS_PROD guard`            | `server.ts`     | Bloquea debug endpoints en producción                   |

---

## 8. Estado de Implementación

### Módulos Backend

| Módulo                          | Estado       | Notas                                                 |
| ------------------------------- | ------------ | ----------------------------------------------------- |
| Express server + static serving | ✅ Completo  | 6-path fallback para Hostinger                        |
| Supabase Auth middleware        | ✅ Completo  | Bearer JWT + session fallback                         |
| Google OAuth (URL + callback)   | ✅ Completo  | Session recovery, refresh token preservation          |
| Token encryption (AES-256-CBC)  | ⚠️ Funcional | Salt estático y key fallback son vulnerabilidades     |
| Chat endpoint (Gemini)          | ✅ Completo  | Tool calling, attachments, memory/task pre-processing |
| Calendar CRUD                   | ✅ Completo  | create/list/search/delete/update events               |
| Gmail read + classify           | ✅ Completo  | Clasificación newsletter/update/general               |
| Gmail drafts (CRUD)             | ✅ Completo  | Draft-only policy con confirmSend                     |
| Gmail send (with confirmation)  | ✅ Completo  | Requiere confirmSend: true explícito                  |
| Gmail AI draft reply            | ✅ Completo  | Genera respuesta con Gemini                           |
| Gmail attachment analysis       | ✅ Completo  | Análisis vía Gemini para tipos soportados             |
| TTS proxy (ElevenLabs)          | ✅ Completo  | Preview + generation                                  |
| STT proxy (Gemini)              | ✅ Completo  | Multer upload + transcription                         |
| Daily briefing                  | ✅ Completo  | Auto-trigger en saludo (1x/día/timezone)              |
| Memory CRUD                     | ✅ Completo  | save/recall/forget memories                           |
| Task CRUD                       | ✅ Completo  | save/complete/list tasks                              |
| Timezone resolution             | ✅ Completo  | ~40 ciudades, fuzzy matching Levenshtein              |
| Rate limiting                   | ❌ Pendiente | Sin protección contra abuso                           |
| Request timeout (Gemini)        | ❌ Pendiente | Llamada puede bloquear server indefinidamente         |
| Session store persistente       | ❌ Pendiente | MemoryStore no es production-ready                    |

### Módulos Frontend

| Módulo                         | Estado          | Notas                                         |
| ------------------------------ | --------------- | --------------------------------------------- |
| Login / Signup                 | ✅ Completo     | Supabase Auth, i18n completo                  |
| Chat UI                        | ✅ Completo     | Historial, onboarding, acciones, markdown     |
| Calendar UI                    | ⚠️ Parcial      | Vista mensual OK, search button sin handler   |
| Inbox UI                       | ✅ Completo     | Lectura, drafts, adjuntos, AI reply           |
| Profile UI                     | ✅ Completo     | Voz, idioma, Google connection                |
| Onboarding (4 steps)           | ✅ Completo     | Idioma → bienvenida → voz → listo             |
| i18n (4 idiomas)               | ⚠️ Parcial      | 220 keys, pero diacríticos faltantes en fi/sv |
| PWA install + update           | ✅ Completo     | Prompt + overlay obligatorio                  |
| Error boundary                 | ✅ Completo     | Fallbacks en inglés (BUG)                     |
| ActionMenu (attach/screenshot) | ❌ Stub         | Solo console.log                              |
| ProductivitySnapshot           | ❌ No importado | Componente existe pero no se usa              |

### Backend Localization

| Componente                     | Estado                   | Notas                                  |
| ------------------------------ | ------------------------ | -------------------------------------- |
| System prompts (mimaStyles.ts) | ❌ Solo ES               | 5 modos, todos en español              |
| Tool instructions              | ❌ Solo ES               | Calendar + Gmail tools en español      |
| Format responses (calendar)    | ⚠️ Parcial               | ES + EN, sin fi/sv                     |
| Format responses (gmail)       | ❌ Solo ES               | Draft created/updated/sent/deleted     |
| Daily briefing greeting        | ❌ Solo ES/fi/sv parcial | Saludo horario roto en fi/sv           |
| Memory/task format strings     | ⚠️ Parcial               | En servicios con diacríticos faltantes |
| Error messages (geminiService) | ⚠️ Parcial               | ES + EN, sin fi/sv                     |

---

## 9. Deuda Técnica y Errores

### Bugs Críticos (ver AGENTS.md Sección 13 para detalles completos)

| ID      | Bug                                 | Impacto                                            |
| ------- | ----------------------------------- | -------------------------------------------------- |
| BUG-001 | Backend 100% en español             | Producto inutilizable en mercado principal (fi/sv) |
| BUG-002 | Salt estático + key fallback        | Tokens descifrables                                |
| BUG-003 | SESSION_SECRET fallbacks            | Sesiones forjables                                 |
| BUG-004 | `process.env` en servicios frontend | 3 servicios crashean en browser                    |
| BUG-005 | `node:crypto` import en frontend    | Mismo crash                                        |

### Patrones Sistémicos de Deuda

1. **server.ts monolítico (5573 líneas)**: Todo el backend en un archivo. Refactor BK-011 priorizado pero esfuerzo alto.

2. **Dualidad de servicios en `src/services/`**: 3 servicios (`userPreferences`, `userMemory`, `userTask`) son backend-only pero viven en `src/`. Usan `process.env` y `node:crypto` que rompen el browser si se importan accidentalmente.

3. **i18n asimétrico**: Frontend tiene 220 keys en 4 idiomas vía i18next. Backend tiene cero sistema de localización — todos los strings están hardcodeados en español.

4. **Código muerto (~520 líneas)**: 3 bloques `if (false && ...)` en server.ts duplican lógica ya refactorizada. Deben eliminarse (BK-012).

5. **Auth detection frágil**: `Chat.tsx:481-483` detecta errores de auth buscando `"auth"` en el texto de respuesta. Puede matchear respuestas AI legítimas.

6. **Diacríticos sistemáticamente faltantes**: Traducciones fi/sv en locale JSON y en servicios usan ASCII sin diacríticos (ej: `tehtavia` vs `tehtäviä`).

---

## 10. Backlog Priorizado

### 🔴 Crítico (Bloquea mercado principal)

| ID     | Tarea                                                      | Esfuerzo | Depende de                        |
| ------ | ---------------------------------------------------------- | -------- | --------------------------------- |
| BK-001 | Localizar backend: system prompts, tools, format responses | Alto     | Diseñar locale system para server |
| BK-002 | Eliminar fallbacks SESSION_SECRET, salt, key               | Bajo     | —                                 |
| BK-003 | Mover 3 servicios a backend-only                           | Medio    | Actualizar tsconfig.server.json   |
| BK-004 | Sincronizar esquema Supabase real                          | Medio    | Acceso panel Supabase             |

### 🟡 Alto (Antes de lanzar)

| ID     | Tarea                              | Esfuerzo | Depende de |
| ------ | ---------------------------------- | -------- | ---------- |
| BK-005 | Timeout 30s en llamadas Gemini     | Bajo     | —          |
| BK-006 | Rate limiting (express-rate-limit) | Bajo     | —          |
| BK-007 | Session store persistente          | Medio    | BK-002     |
| BK-008 | Proteger debug endpoints en prod   | Bajo     | —          |
| BK-009 | Corregir auth error detection      | Bajo     | —          |
| BK-010 | Localizar mensajes de error        | Medio    | —          |

### 🟢 Medio (Backlog)

| ID     | Tarea                                | Esfuerzo | Depende de |
| ------ | ------------------------------------ | -------- | ---------- |
| BK-011 | Refactorizar server.ts en módulos    | Alto     | —          |
| BK-012 | Eliminar código muerto (~520 líneas) | Bajo     | —          |
| BK-013 | Consolidar DEFAULT_VOICE_ID          | Bajo     | —          |
| BK-014 | Eliminar .eslintrc.json legacy       | Bajo     | —          |
| BK-015 | Corregir diacríticos fi/sv           | Medio    | —          |
| BK-016 | Mover assets i.postimg.cc a /public/ | Bajo     | —          |
| BK-017 | Implementar adjuntar archivos        | Alto     | Diseño UX  |
| BK-018 | Agregar framework de testing         | Alto     | —          |

---

## 11. Guía de Replicación desde Cero

### Orden de implementación para reproducir el estado actual:

1. **Supabase**: Crear proyecto, ejecutar migraciones (profiles + app_data), configurar RLS
2. **Google Cloud**: Crear OAuth credentials, habilitar Calendar API + Gmail API, configurar redirect URIs
3. **ElevenLabs**: Crear cuenta, obtener API key, configurar voces
4. **Gemini**: Crear API key en AI Studio
5. **Backend** (`server.ts`): Express + auth middleware + OAuth flow + chat endpoint + tool calling
6. **Frontend** (`src/`): React app con routing, auth context, chat UI
7. **Integraciones**: Calendar + Gmail endpoints + TTS/STT proxy
8. **i18n**: Configurar i18next con 4 locales
9. **PWA**: Configurar vite-plugin-pwa + manifest + service worker
10. **Deploy**: Configurar Hostinger con app.js bootstrap

### Decisiones a mantener:

- Monolithic proxy (no BFF separado) — simplicidad de deploy
- Draft-only Gmail — seguridad contra envío automático
- Tool calling JSON (no function calling nativo) — compatibilidad con Flash
- Express session para OAuth + JWT para API calls — dual auth necesaria
- `saveSession()` con retries — previene race condition en callback

---

## 12. Changelog del Documento

| Fecha      | Versión | Descripción                                         |
| ---------- | ------- | --------------------------------------------------- |
| 2026-04-20 | v1.0    | Creación inicial — auditoría completa, 13 secciones |

---

## 13. Contexto para IA

### Reglas de Negocio Inquebrantables

1. **Gmail Draft-Only**: NUNCA enviar email sin `confirmSend: true`
2. **Scope Validation**: Siempre verificar scopes antes de operaciones write
3. **User Isolation**: Todas las queries incluyen `user_id` filter
4. **Model Routing**: flash por defecto, pro solo para tasks complejos
5. **API Proxy**: NINGÚN fetch directo a APIs externas desde frontend
6. **i18n Obligatorio**: CERO strings hardcodeados en .tsx

### Terminología Rápida

| Término          | Significado en este codebase                                         |
| ---------------- | -------------------------------------------------------------------- |
| Tool Call        | JSON que Gemini genera para ejecutar acciones (calendar/gmail)       |
| Briefing         | Resumen automático al saludar (eventos + emails + tareas + memorias) |
| Secure Draft     | Borrador Gmail que necesita confirmación del usuario                 |
| MimaStyle        | Modo de personalidad IA (neutral/profesional/creativo/zen/familiar)  |
| Memory           | Dato que el usuario pide recordar ("recuerda que...")                |
| Session Recovery | Extraer userId del state OAuth cuando se pierde la sesión Express    |

### Atajos de Comprensión

- `server.ts` es TODO el backend — si algo pasa en server, está ahí
- Los 3 servicios en `src/services/` son backend-only — NO importarlos en componentes React
- `src/lib/supabase.ts` es el único punto de conexión Supabase desde frontend
- `src/config/mimaStyles.ts` define los system prompts — están en español y es un bug
- `src/constants/voices.ts` tiene `DEFAULT_VOICE_ID` — importar de ahí, no hardcodear
- El flujo OAuth es delicado: session puede perderse, recovery via state parameter
- `supabase-migration.sql` tiene las tablas más completas (incluye user_memories, user_tasks)

### Convenciones Detectadas

- **Imports**: Single quotes para módulos, double quotes para JSX attributes
- **Tipado**: `any` usado frecuentemente en catch blocks y components
- **Naming**: PascalCase componentes, camelCase funciones, UPPER_SNAKE constantes
- **State**: `useState` + `useCallback` para estado local, Context para estado global
- **API calls**: `fetch()` con async/await, Bearer token en headers
- **Error handling**: console.error + try/catch, toast para usuario, JSON con errorCode para frontend
- **Comments**: EN en código, ES en system prompts
- **Git commits**: conventional commits (fix:, feat:, refactor:)
