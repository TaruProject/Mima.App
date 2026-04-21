# AGENTS.md — Mima App v2.0

> Manual de ejecución para agentes de código. Optimizado para Kilo Code.
> Última actualización: 2026-04-20 | Basado en auditoría completa del código fuente.

---

## 1. Project Overview

| Campo            | Valor                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| **Nombre**       | Mima                                                                             |
| **Tipo**         | PWA — Asistente personal de IA multilingüe                                       |
| **Audiencia**    | Usuarios individuales productividad (mercado principal: 🇫🇮 Finlandia, 🇸🇪 Suecia) |
| **Stack**        | React 19 + Vite 6 + Express 4.21 + Supabase + Gemini 2.5 + ElevenLabs            |
| **Arquitectura** | Monolithic Proxy — Express sirve SPA + proxifica APIs externas                   |

**Qué hace**: Chat con IA (Gemini), gestión Google Calendar (CRUD), Gmail (lectura + borradores seguros), voz (TTS/STT), memorias, tareas, daily briefing.

**Qué NO está en scope**:

- ❌ WebSockets / tiempo real
- ❌ Redis / BullMQ / colas
- ❌ Zustand / Redux / state libs externas
- ❌ Drizzle / Prisma / ORM
- ❌ Next.js (NO existe en este proyecto)
- ❌ Adjuntar archivos (stub — `onAttachFile` solo hace `console.log`)
- ❌ Captura de pantalla (stub — `onTakeScreenshot` solo hace `console.log`)

---

## 2. Dev Environment

### Scripts

| Comando                | Qué hace                                     | Notas                                                             |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `npm install`          | Instala dependencias                         | —                                                                 |
| `npm run dev`          | Inicia `tsx server.ts` en puerto 3000        | Vite middleware en dev                                            |
| `npm run build`        | `lint` → `build:server` → `build:client`     | Output: `dist/` + `dist-server/`                                  |
| `npm run build:client` | `vite build`                                 | Output: `dist/`                                                   |
| `npm run build:server` | `tsc -p tsconfig.server.json` + copy package | Output: `dist-server/`                                            |
| `npm start`            | `node app.js` (Hostinger bootstrap)          | Busca `dist-server/server.js` primero, fallback a `tsx server.ts` |
| `npm run lint`         | `tsc --noEmit`                               | Solo TypeScript, sin ESLint en CI                                 |
| `npm run clean`        | Elimina `dist/` y `dist-server/`             | —                                                                 |

### Variables de Entorno (.env)

| Variable                    | Scope             | Requerida | Propósito                          |
| --------------------------- | ----------------- | --------- | ---------------------------------- |
| `GEMINI_API_KEY`            | Backend           | ✅        | Auth Gemini API                    |
| `GOOGLE_CLIENT_ID`          | Backend           | ✅        | Google OAuth                       |
| `GOOGLE_CLIENT_SECRET`      | Backend           | ✅        | Google OAuth                       |
| `ELEVENLABS_API_KEY`        | Backend           | ✅        | TTS proxy                          |
| `VITE_SUPABASE_URL`         | Frontend (VITE\_) | ✅        | Supabase project URL               |
| `VITE_SUPABASE_ANON_KEY`    | Frontend (VITE\_) | ✅        | Supabase public key                |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend           | ✅        | Admin DB ops (encriptación tokens) |
| `APP_URL`                   | Backend           | ✅ prod   | `https://me.mima-app.com`          |
| `SESSION_SECRET`            | Backend           | ✅        | Encriptación sesión (mín 32 chars) |
| `HOSTINGER_ENV`             | Backend           | Prod      | Detección ambiente Hostinger       |

> ⚠️ **NUNCA** poner `GOOGLE_CLIENT_SECRET`, `ELEVENLABS_API_KEY`, o `SUPABASE_SERVICE_ROLE_KEY` en código frontend (`src/`).

### Deploy (Hostinger)

```
Raíz del dominio:
  app.js, package.json, package-lock.json, .env, dist-server/, node_modules/

public_html/:
  Contenido de dist/ + .htaccess
```

**Bootstrap**: `app.js` → busca `dist-server/server.js` → fallback `tsx server.ts`.

---

## 3. Agent Persona & Language Rules

### Rol del Agente

Eres un **Senior Full-Stack Engineer** con acceso completo al código. Tu misión: implementar, debuggear y refactorizar Mima App siguiendo las reglas de este documento.

### Split de Idioma

| Contexto              | Idioma                               | Ejemplo                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------- |
| Comentarios de código | EN                                   | `// Validate session before OAuth redirect`       |
| Commits               | EN                                   | `fix: prevent session loss during OAuth callback` |
| Strings de usuario    | i18n (`t()`)                         | `t('chat.welcome_message')`                       |
| System prompts (IA)   | ES (actual) — ⚠️ migrar a multi-lang | Ver `mimaStyles.ts`                               |
| Respuestas al usuario | Según idioma detectado               | —                                                 |
| Documentación técnica | EN                                   | Este archivo                                      |

### Regla Crítica de i18n

**CERO strings hardcodeados en `.tsx`/`.jsx`**. Todo texto visible al usuario DEBE pasar por `t()` de `react-i18next`. Incluye: botones, headings, placeholders, errores, `aria-label`, labels de navegación.

---

## 4. NON-NEGOTIABLE WORKFLOW — 7 Steps

```
INPUT → PLAN → ROUTER → EXECUTION → MEMORY → VERIFY → DELIVERY
```

### Step 1: INPUT

- Recibir tarea del usuario
- Identificar archivos afectados con `@mentions`
- Leer este `AGENTS.md` completo antes de actuar

### Step 2: PLAN

- Crear spec en `.kilo/plans/` antes de modificar código
- Documentar: qué cambia, por qué, dependencias, rollback plan
- Si la tarea es >3 pasos, descomponer en subtareas atómicas

### Step 3: ROUTER

- Clasificar: `feature` | `bugfix` | `refactor` | `security` | `i18n`
- Si es `security`: máximo cuidado, no deploy sin verify completo
- Si es `i18n`: SIEMPRE actualizar los 4 locale files (en, es, fi, sv)

### Step 4: EXECUTION

- Implementar en orden: types → lógica → UI → i18n
- Seguir Hard Coding Rules (Sección 5)
- No dejar el codebase en estado no-ejecutable

### Step 5: MEMORY

- Actualizar este `AGENTS.md` si se añaden patrones o reglas nuevas
- Actualizar `ARCHITECTURE.md` si cambian módulos o endpoints
- Registrar en Changelog (Sección 15)

### Step 6: VERIFY

- `npm run lint` (tsc --noEmit) — DEBE pasar sin errores
- Verificar i18n: 4 JSON files con keys idénticas
- Verificar seguridad: sin API keys en `src/`
- Verificar funcionalidad: la app arranca sin crash

### Step 7: DELIVERY

- `/local-review-uncommitted` antes de commit
- Solo commit cuando usuario lo solicita explícitamente
- Mensaje de commit: tipo + scope + descripción corta

---

## 5. Hard Coding Rules

| Regla                      | ✅ Hacer                                                       | ❌ NO Hacer                                                 |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| **Encriptación de tokens** | Usar `encrypt()`/`decrypt()` con AES-256-CBC en `server.ts`    | Guardar tokens Google en plaintext                          |
| **SESSION_SECRET**         | Requerir variable de entorno, fallar startup si falta          | Usar fallback hardcoded                                     |
| **CSP**                    | Middleware Express aplica CSP unificado en todos los ambientes | Agregar CSP en `.htaccess` (duplica conflicto)              |
| **Gmail Draft-Only**       | Crear borrador, pedir confirmación explícita, luego enviar     | Enviar email directamente sin confirmación                  |
| **Scope Validation**       | `ensureGoogleWriteAccess()` antes de operaciones write         | Asumir que el usuario tiene permisos                        |
| **Model Routing**          | `selectModelForTask()` elige flash vs pro                      | Hardcodear modelo en endpoint                               |
| **API Proxy**              | Todas las APIs externas van por `server.ts` proxy              | `fetch()` directo a Gemini/ElevenLabs/Google desde frontend |
| **i18n Strings**           | `t('section.key')` en todos los `.tsx`                         | Hardcodear texto en cualquier idioma                        |
| **Voice ID**               | Importar `DEFAULT_VOICE_ID` de `src/constants/voices.ts`       | Hardcodear `"DODLEQrClDo8wCz460ld"`                         |
| **Env vars frontend**      | `import.meta.env.VITE_*` en código frontend                    | `process.env` en código frontend                            |
| **Supabase client**        | Usar singleton de `src/lib/supabase.ts`                        | Crear `createClient()` nuevo por llamada                    |
| **Service role key**       | Solo en `server.ts` y servicios backend                        | Referenciar en archivos dentro de `src/`                    |
| **Session save**           | `saveSession()` con reintentos antes de redirect               | `req.session.save()` sin await/retry                        |
| **Onboarding flag**        | Escribir `mima_onboarding_done` solo en step final             | Escribir antes de completar onboarding                      |
| **Error responses**        | HTTP status code correcto + JSON con errorCode                 | Retornar 200 con nota de error en body                      |

---

## 6. File Map — Where Things Live

### Backend

| Archivo                | Propósito                                                         | Líneas | Notas                  |
| ---------------------- | ----------------------------------------------------------------- | ------ | ---------------------- |
| `server.ts`            | Backend monolítico: auth, chat, calendar, gmail, tts, stt, static | 5573   | ⚠️ Refactor pendiente  |
| `app.js`               | Bootstrap para Hostinger Passenger                                | 143    | Production only        |
| `tsconfig.server.json` | TS config para compilación backend                                | 16     | Output: `dist-server/` |

### Frontend — Pages

| Archivo                        | Propósito                                | Líneas |
| ------------------------------ | ---------------------------------------- | ------ |
| `src/pages/Chat.tsx`           | Chat UI, historial, onboarding, acciones | 1043   |
| `src/pages/Inbox.tsx`          | Gmail UI, lectura, drafts, adjuntos      | 648    |
| `src/pages/Profile.tsx`        | Perfil, voz, idioma, conexión Google     | 543    |
| `src/pages/Calendar.tsx`       | Vista calendario mensual                 | 298    |
| `src/pages/Auth.tsx`           | Login/Signup Supabase                    | 107    |
| `src/pages/GoogleCallback.tsx` | Procesamiento redirect OAuth             | 74     |

### Frontend — Components

| Archivo                                        | Propósito                                    |
| ---------------------------------------------- | -------------------------------------------- |
| `src/components/Layout.tsx`                    | Shell de navegación inferior                 |
| `src/components/InstallPWA.tsx`                | Prompt de instalación PWA                    |
| `src/components/UpdateOverlay.tsx`             | Overlay de actualización obligatoria         |
| `src/components/ErrorBoundary.tsx`             | Catch de errores de render                   |
| `src/components/ProductivitySnapshot.tsx`      | Widget resumen productividad ⚠️ no importado |
| `src/components/onboarding/OnboardingFlow.tsx` | Flujo onboarding (4 steps: 0-3)              |
| `src/components/ui/ActionMenu.tsx`             | Menú de acciones del chat                    |
| `src/components/ui/ModeBottomSheet.tsx`        | Selector de modo IA                          |
| `src/components/ui/Toast.tsx`                  | Notificaciones toast                         |

### Frontend — Services (⚠️ Backend-Only, importados por server.ts)

| Archivo                                  | Propósito                          | ⚠️ Problema                                          |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `src/services/userPreferencesService.ts` | CRUD preferencias + historial chat | Usa `process.env` y `node:crypto` — roto en frontend |
| `src/services/userMemoryService.ts`      | CRUD memorias usuario              | Usa `process.env` y `node:crypto` — roto en frontend |
| `src/services/userTaskService.ts`        | CRUD tareas usuario                | Usa `process.env` y `node:crypto` — roto en frontend |
| `src/services/geminiService.ts`          | Wrapper API chat + TTS             | Funciona en frontend                                 |

### Frontend — Core

| Archivo                                      | Propósito                                 |
| -------------------------------------------- | ----------------------------------------- |
| `src/App.tsx`                                | Router, ProtectedRoute, PWA update        |
| `src/main.tsx`                               | React root + PWA SW registration          |
| `src/contexts/AuthContext.tsx`               | Supabase auth state provider              |
| `src/contexts/ToastContext.tsx`              | Toast notification provider               |
| `src/lib/supabase.ts`                        | Supabase client singleton                 |
| `src/hooks/useGoogleConnection.ts`           | Estado conexión Google + OAuth            |
| `src/hooks/useVoiceRecording.ts`             | Grabación + transcripción audio           |
| `src/hooks/useAudioPlayback.ts`              | Reproducción TTS con fallback iOS         |
| `src/hooks/useToast.ts`                      | Toast hook                                |
| `src/constants/voices.ts`                    | 16 voces en 5 regiones + DEFAULT_VOICE_ID |
| `src/config/mimaStyles.ts`                   | 5 modos IA + system prompts               |
| `src/i18n/index.ts`                          | i18next config                            |
| `src/i18n/locales/{en,es,fi,sv}/common.json` | 220 keys por idioma                       |

### Base de Datos

| Archivo                                                         | Propósito                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `supabase/migrations/20260316000000_create_profiles.sql`        | Tabla profiles + trigger auto-create                                      |
| `supabase/migrations/20260323000000_create_app_data_tables.sql` | user_preferences, chat_messages, user_google_tokens                       |
| `supabase-migration.sql`                                        | Legacy manual migration (idéntico al segundo + user_memories, user_tasks) |

### Scripts y Config

| Archivo                            | Propósito                                              |
| ---------------------------------- | ------------------------------------------------------ |
| `scripts/write-build-info.cjs`     | Genera `src/generated/buildInfo.ts`                    |
| `scripts/write-server-package.cjs` | Copia package.json a dist-server/                      |
| `scripts/check-i18n.js`            | Verifica keys simétricas en 4 locales                  |
| `vite.config.ts`                   | Vite + React + Tailwind + PWA plugins                  |
| `eslint.config.js`                 | Flat config ESLint 9 (activo)                          |
| `.eslintrc.json`                   | Legacy config (⚠️ eliminar, conflicto con flat config) |

---

## 7. Database & Auth Schema

### Tablas

| Tabla                | PK                            | Columnas                                                                                                              | RLS                                     | Propósito                         |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| `profiles`           | `id` (UUID → auth.users)      | name, username, language, voice_id, avatar_url, created_at, updated_at                                                | ✅ SELECT público, INSERT/UPDATE propio | Perfil de usuario                 |
| `user_preferences`   | `user_id` (UUID → auth.users) | onboarding_done, voice_id, language, last_daily_briefing_at, created_at, updated_at                                   | ✅ CRUD propio                          | Preferencias + flag onboarding    |
| `chat_messages`      | `id` (UUID auto)              | user_id, role (user/assistant/system), content, mode, audio_data, created_at, updated_at                              | ✅ CRUD propio                          | Historial de chat                 |
| `user_google_tokens` | `user_id` (UUID → auth.users) | tokens (AES-256-CBC encrypted), updated_at                                                                            | ✅ (sin policies — solo service role)   | Tokens OAuth Google encriptados   |
| `user_memories`      | `id` (UUID auto)              | user_id, memory_key (UNIQUE), memory_text, category, created_at, updated_at                                           | ✅ CRUD propio                          | Memorias persistentes del usuario |
| `user_tasks`         | `id` (UUID auto)              | user_id, task_key (UNIQUE), title, status (open/completed), source_text, due_at, completed_at, created_at, updated_at | ✅ CRUD propio                          | Tareas del usuario                |

### Encriptación de Tokens

```
SESSION_SECRET → scrypt(salt, 32 bytes) → AES-256-CBC key
                                      → encrypt/decrypt tokens Google
```

⚠️ **VERIFY**: El salt es estático (`'salt'`) y hay key fallback `Buffer.alloc(32, 'a')`. Ambos son vulnerabilidades críticas.

### Flujo Auth

```
1. Usuario → Supabase Auth (email/password) → JWT session
2. Frontend → Authorization: Bearer <jwt> → server.ts middleware
3. server.ts → supabase.auth.getUser(token) → req.user
4. OAuth Google → /api/auth/url → Google consent → /api/auth/callback/google
5. Callback → intercambia code → tokens → encrypt → Supabase + session
6. Subsecuente → req.session.tokens || Supabase fallback → getUserTokens()
```

### Dual Auth Mechanism

| Mecanismo                | Uso                       | Storage               |
| ------------------------ | ------------------------- | --------------------- |
| Supabase JWT (Bearer)    | API calls autenticadas    | Frontend memory       |
| Express Session (cookie) | OAuth flow, Google tokens | MemoryStore (⚠️ prod) |

---

## 8. Routing & Access Control

### React Router v7

| Ruta                        | Componente     | Guard          | Descripción          |
| --------------------------- | -------------- | -------------- | -------------------- |
| `/`                         | Chat           | ProtectedRoute | Chat principal       |
| `/calendar`                 | Calendar       | ProtectedRoute | Vista calendario     |
| `/inbox`                    | Inbox          | ProtectedRoute | Gmail                |
| `/profile`                  | Profile        | ProtectedRoute | Ajustes              |
| `/auth`                     | Auth           | Público        | Login/Signup         |
| `/api/auth/callback/google` | GoogleCallback | Público        | OAuth redirect       |
| `/auth/callback/google`     | GoogleCallback | Público        | OAuth redirect (alt) |

**ProtectedRoute**: Verifica `session` de `AuthContext`. Sin sesión → redirect a `/auth`.

### Express Auth Middleware

`authenticateSupabaseUser` (server.ts:257):

1. Extrae `Authorization: Bearer <token>`
2. `supabase.auth.getUser(token)` → valida JWT
3. Fallback: `req.session.userId` → verifica con service role
4. Adjunta `req.user` al request

### PWA Routing

- SPA catch-all: `GET *` → sirve `index.html` con `no-cache`
- Assets hasheados: `Cache-Control: max-age=31536000, immutable`
- `sw.js`: `no-cache, no-store, must-revalidate`

---

## 9. Business Rules (Never Override)

### BR-1: Gmail Draft-Only Policy

```
Usuario: "Responde este email"
→ Mima: createGmailDraft() → "Borrador creado. ¿Envío?"
→ Usuario: "Sí"
→ Mima: sendGmailDraft(draftId, confirmSend: true) → Email enviado
```

**NUNCA** enviar sin `confirmSend: true`. El endpoint `POST /api/gmail/drafts/:id/send` retorna 400 sin este campo.

### BR-2: Scope Validation

`ensureGoogleWriteAccess(tokens, serviceName)` verifica que los tokens incluyen scopes de escritura antes de operaciones modify. Sin write scope → mensaje al usuario indicando reconectar.

### BR-3: Daily Briefing

- Trigger: saludo detectado + `shouldSendAutomaticBriefing()` (máx 1 vez/día/timezone)
- Contenido: eventos calendario + emails + tareas + memorias
- Requiere `userTokens` (Google conectado)

### BR-4: Memoria/Tareas aisladas por usuario

- Todas las queries incluyen `user_id` filter
- RLS en Supabase: `auth.uid() = user_id`
- Service role key usada solo en backend para operaciones cross-user

### BR-5: Idioma de respuesta = idioma del usuario

- System prompt incluye `languageInstructions[language]`
- Tool call responses deben usar `langCode` del request
- ⚠️ **BUG ACTUAL**: System prompts y tool instructions están en español; respuestas de formato calendario/gmail ignoran idioma para fi/sv

---

## 10. Data Persistence Model

| Dato                | Storage                                                   | TTL                                          | Notas                            |
| ------------------- | --------------------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Auth session        | Supabase Auth (JWT)                                       | 1h access token, refresh token               | —                                |
| Express session     | MemoryStore                                               | 24h cookie                                   | ⚠️ Se pierde al reiniciar server |
| Google OAuth tokens | Supabase `user_google_tokens` (encrypted) + session cache | Hasta revocación                             | Session cache para velocidad     |
| Chat history        | Supabase `chat_messages`                                  | Permanente                                   | Por usuario                      |
| User preferences    | Supabase `user_preferences`                               | Permanente                                   | Onboarding, voz, idioma          |
| User memories       | Supabase `user_memories`                                  | Permanente                                   | Hasta "olvida X"                 |
| User tasks          | Supabase `user_tasks`                                     | Permanente                                   | Hasta completar/eliminar         |
| Voice ID            | Supabase + localStorage `mima_voice_id`                   | Permanente                                   | Doble storage                    |
| Language            | Supabase + localStorage `mima_language`                   | Permanente                                   | Doble storage                    |
| Onboarding done     | localStorage `mima_onboarding_done`                       | Permanente                                   | Solo en step final               |
| PWA cache           | Service Worker (Workbox)                                  | Navigation: NetworkFirst, Assets: CacheFirst | —                                |
| Gemini init state   | In-memory (`genAI`, `geminiInitialized`)                  | Until restart                                | Retry con backoff 2s/4s          |

---

## 11. API & Tool Calling Conventions

### Endpoints Map

| Método | Ruta                                       | Auth            | Propósito                      |
| ------ | ------------------------------------------ | --------------- | ------------------------------ |
| GET    | `/api/ping`                                | No              | Health ping                    |
| GET    | `/api/health`                              | No              | Estado env vars                |
| GET    | `/api/health-detailed`                     | No              | Estado Gemini + env            |
| GET    | `/api/version`                             | No              | Build version                  |
| GET    | `/api/auth/url`                            | Bearer          | Genera URL OAuth Google        |
| GET    | `/api/auth/callback/google`                | Session         | Callback OAuth                 |
| GET    | `/api/auth/status`                         | No              | Estado conexión Google         |
| DELETE | `/api/auth/google`                         | Bearer          | Desconectar Google             |
| POST   | `/api/chat`                                | Bearer          | Chat con Gemini + tool calling |
| GET    | `/api/chat/history`                        | Bearer          | Historial chat                 |
| POST   | `/api/chat/message`                        | Bearer          | Guardar mensaje                |
| DELETE | `/api/chat/history`                        | Bearer          | Limpiar historial              |
| GET    | `/api/user/preferences`                    | Bearer          | Preferencias usuario           |
| POST   | `/api/user/preferences`                    | Bearer          | Actualizar preferencias        |
| GET    | `/api/user/tasks`                          | Bearer          | Tareas usuario                 |
| POST   | `/api/tts`                                 | Bearer          | Generar audio TTS              |
| GET    | `/api/tts/preview`                         | Bearer          | Preview voz TTS                |
| POST   | `/api/transcribe`                          | Bearer + multer | STT vía Gemini                 |
| GET    | `/api/calendar/events`                     | Bearer          | Eventos Google Calendar        |
| GET    | `/api/gmail/messages`                      | Bearer          | Emails no leídos               |
| GET    | `/api/gmail/messages/:id`                  | Bearer          | Email completo                 |
| GET    | `/api/gmail/messages/:id/attachments/:aid` | Bearer          | Adjunto email                  |
| POST   | `/api/gmail/messages/:id/draft-reply-ai`   | Bearer          | AI draft reply                 |
| POST   | `/api/gmail/draft`                         | Bearer          | Crear borrador                 |
| GET    | `/api/gmail/drafts`                        | Bearer          | Listar borradores              |
| GET    | `/api/gmail/drafts/:id`                    | Bearer          | Obtener borrador               |
| PUT    | `/api/gmail/drafts/:id`                    | Bearer          | Actualizar borrador            |
| POST   | `/api/gmail/drafts/:id/send`               | Bearer          | Enviar borrador (confirmSend)  |
| DELETE | `/api/gmail/drafts/:id`                    | Bearer          | Eliminar borrador              |

### Tool Calling JSON Schema (Gemini → Server)

```json
// Calendar tools
{"tool": "createCalendarEvent", "summary": "...", "dateText": "mañana a las 3pm", "description": "..."}
{"tool": "listCalendarEvents", "dateText": "esta semana", "maxResults": 10}
{"tool": "searchCalendarEvents", "query": "reunión", "maxResults": 5}
{"tool": "deleteCalendarEvent", "eventId": "..."}
{"tool": "updateCalendarEvent", "eventId": "...", "summary": "...", "dateText": "..."}

// Gmail tools
{"tool": "readGmailMessage", "messageId": "..."}
{"tool": "createGmailDraft", "to": "...", "subject": "...", "body": "<p>...</p>", "inReplyTo": "...", "threadId": "..."}
{"tool": "listGmailDrafts"}
{"tool": "deleteGmailDraft", "draftId": "..."}
{"tool": "sendGmailDraft", "draftId": "...", "confirmSend": true}

// Utility
{"tool": "getCurrentTime", "location": "Helsinki"}
```

### Model Routing (`selectModelForTask`)

| Condición                             | Modelo             | Razón                    |
| ------------------------------------- | ------------------ | ------------------------ |
| Default                               | `gemini-2.5-flash` | 95% de tareas, velocidad |
| Adjuntos (imágenes/docs)              | `gemini-2.5-pro`   | Análisis visual complejo |
| Business mode + tarea compleja        | `gemini-2.5-pro`   | Razonamiento avanzado    |
| Mensaje largo (>4000 chars) + complex | `gemini-2.5-pro`   | Contexto extendido       |

---

## 12. Testing Checklist (Step 6 — VERIFY)

### Pre-Commit

- [ ] `npm run lint` pasa sin errores TypeScript
- [ ] 4 locale JSON files tienen mismo número de keys (ejecutar `node scripts/check-i18n.js`)
- [ ] Sin API keys en archivos `src/` (grep `process.env` en src/)
- [ ] Sin strings hardcodeados en `.tsx` (grep `"[A-Z]` en src/pages/ y src/components/)

### Seguridad

- [ ] CSP headers presentes en response (verificar con DevTools)
- [ ] Tokens Google se encriptan antes de guardar en Supabase
- [ ] Endpoint `/api/gmail/drafts/:id/send` requiere `confirmSend: true`
- [ ] Debug endpoints bloqueados en producción (`IS_PROD` guard)
- [ ] Sin `SUPABASE_SERVICE_ROLE_KEY` en código frontend

### OAuth

- [ ] Redirect URIs en Google Cloud Console incluyen ambos paths
- [ ] `saveSession()` con await antes de redirect en callback
- [ ] State parameter incluye userId para recovery de sesión perdida
- [ ] Refresh token se preserva cuando Google no envía uno nuevo

### Tool Calling

- [ ] JSON de tool call se parsea correctamente (con y sin markdown fences)
- [ ] `ensureGoogleWriteAccess()` se ejecuta antes de operaciones write
- [ ] Respuestas de formato usan `langCode` del request

### Funcionalidad

- [ ] App arranca sin crash en `/`
- [ ] Chat envía y recibe mensajes
- [ ] Calendario muestra eventos si Google conectado
- [ ] TTS genera audio playable
- [ ] Onboarding completa solo en step final

---

## 13. Known Bugs / Tech Debt

### 🔴 Crítico

| ID      | Bug                                                                 | Archivo:Línea                                                                   | Impacto                        |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| BUG-001 | System prompts, tool instructions, format responses 100% en español | `server.ts:3399-3586`                                                           | Producto inutilizable en fi/sv |
| BUG-002 | Salt estático `'salt'` + key fallback `Buffer.alloc(32, 'a')`       | `server.ts:134,137`                                                             | Tokens Google descifrables     |
| BUG-003 | SESSION_SECRET fallbacks hardcodeados conocidos                     | `server.ts:133,190`                                                             | Sesiones forjables             |
| BUG-004 | `process.env` en servicios frontend (no existe en Vite)             | `userPreferencesService.ts:7`, `userMemoryService.ts:6`, `userTaskService.ts:6` | Servicios crashean en browser  |
| BUG-005 | `import { createHash } from "node:crypto"` en frontend              | `userMemoryService.ts:1`, `userTaskService.ts:1`                                | Import crash en browser        |

### 🟡 Importante

| ID      | Bug                                              | Archivo:Línea                        | Impacto                          |
| ------- | ------------------------------------------------ | ------------------------------------ | -------------------------------- |
| BUG-006 | MemoryStore para sesiones en producción          | `server.ts:189`                      | Memory leak, sin persistencia    |
| BUG-007 | Sin rate limiting en endpoints API               | `server.ts`                          | Abuso potencial                  |
| BUG-008 | Sin timeout en llamadas Gemini                   | `server.ts:3595`                     | Request puede bloquear server    |
| BUG-009 | Gmail draft responses solo en español            | `server.ts:5012,5157,5184,5218,5254` | UX rota para no-hispanohablantes |
| BUG-010 | Calendar format responses solo ES/EN             | `server.ts:2021-2131`                | fi/sv sin traducciones           |
| BUG-011 | Auth error detection por string matching         | `Chat.tsx:481-483`                   | Falsos positivos                 |
| BUG-012 | Debug endpoints sin auth exponen headers/cookies | `server.ts:1157-1187`                | Info leak                        |

### 🟢 Menor

| ID      | Bug                                            | Archivo:Línea                          | Impacto                 |
| ------- | ---------------------------------------------- | -------------------------------------- | ----------------------- |
| BUG-013 | DEFAULT_VOICE_ID hardcodeado en vez de import  | `Chat.tsx:115`, `geminiService.ts:110` | Inconsistencia          |
| BUG-014 | ~520 líneas código muerto (`if (false && ...`) | `server.ts:3329-4251`                  | Mantenibilidad          |
| BUG-015 | Diacríticos faltantes en traducciones fi/sv    | Locale JSON + services                 | Ortografía incorrecta   |
| BUG-016 | Dos configs ESLint conflictivas                | `.eslintrc.json` + `eslint.config.js`  | Confusión               |
| BUG-017 | `React` import innecesario                     | `App.tsx:1`                            | Warning menor           |
| BUG-018 | `user-scalable=no` en index.html               | `index.html:5`                         | Violación accesibilidad |
| BUG-019 | Assets externos desde `i.postimg.cc`           | `index.html:12,15,22,29`               | Dependencia terceros    |

---

## 14. Pending Items (Active Backlog)

### 🔴 Crítico

| ID     | Tarea                                                                                    | Esfuerzo | Depende de                                |
| ------ | ---------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| BK-001 | Localización backend: system prompts + tool instructions + format responses multi-idioma | Alto     | Diseñar sistema de locale en server       |
| BK-002 | Eliminar fallbacks SESSION_SECRET, salt estático, key fallback                           | Bajo     | Definir estrategia de deploy sin fallback |
| BK-003 | Mover 3 servicios a backend-only (eliminar `process.env` + `node:crypto` de `src/`)      | Medio    | Reorganizar imports en server.ts          |
| BK-004 | Sincronizar esquema Supabase real con migraciones locales                                | Medio    | Acceso al panel Supabase                  |

### 🟡 Alto

| ID     | Tarea                                                             | Esfuerzo | Depende de |
| ------ | ----------------------------------------------------------------- | -------- | ---------- |
| BK-005 | Agregar timeout (30s) a llamadas Gemini con AbortController       | Bajo     | —          |
| BK-006 | Agregar rate limiting (`express-rate-limit`)                      | Bajo     | —          |
| BK-007 | Migrar session store de MemoryStore a Supabase/Redis              | Medio    | BK-002     |
| BK-008 | Proteger/eliminar debug endpoints en producción                   | Bajo     | —          |
| BK-009 | Corregir detección auth error en Chat.tsx (usar HTTP status)      | Bajo     | —          |
| BK-010 | Localizar mensajes de error (geminiService, hooks, ErrorBoundary) | Medio    | —          |

### 🟢 Medio

| ID     | Tarea                                             | Esfuerzo | Depende de |
| ------ | ------------------------------------------------- | -------- | ---------- |
| BK-011 | Refactorizar server.ts en módulos separados       | Alto     | —          |
| BK-012 | Eliminar ~520 líneas código muerto                | Bajo     | —          |
| BK-013 | Consolidar DEFAULT_VOICE_ID import                | Bajo     | —          |
| BK-014 | Eliminar `.eslintrc.json` legacy                  | Bajo     | —          |
| BK-015 | Corregir diacríticos fi/sv en locales y servicios | Medio    | —          |
| BK-016 | Mover assets de `i.postimg.cc` a `/public/`       | Bajo     | —          |
| BK-017 | Implementar adjuntar archivos (reemplazar stub)   | Alto     | Diseño UX  |
| BK-018 | Agregar framework de testing (Vitest)             | Alto     | —          |

---

## 15. Changelog

| Fecha      | Versión | Descripción                                                                                      |
| ---------- | ------- | ------------------------------------------------------------------------------------------------ |
| 2026-03-22 | v0.5    | Fix error 503: eliminar panic middleware, rutas estáticas múltiples, Gemini retry, CSP unificado |
| 2026-03-22 | v0.5    | Gmail implementación: draft-only policy, endpoints CRUD, function calling                        |
| 2026-03-23 | v0.6    | Fix Supabase validation, session race condition, debug endpoints protegidos                      |
| 2026-03-23 | v0.6    | Re-auditoría: esquema DB desincronizado, servicios frontend rotos                                |
| 2026-03-24 | v0.7    | MimaStyles con 5 modos, system prompts, memoria, tareas, daily briefing                          |
| 2026-04-20 | v2.0    | Regeneración completa AGENTS.md con estructura Rhodium 18 secciones + auditoría profunda         |

---

## 16. OAuth & Token Security Checklist

### Almacenamiento Encriptado

- [ ] Tokens se encriptan con `encrypt()` (AES-256-CBC) antes de guardar en Supabase
- [ ] `SUPABASE_SERVICE_ROLE_KEY` se usa para operaciones admin en `user_google_tokens`
- [ ] Tokens en sesión se cachean sin encriptar (performance) — session es MemoryStore

### ⚠️ Vulnerabilidades Pendientes

- [ ] Salt estático `'salt'` debe ser aleatorio por deployment
- [ ] Key fallback `Buffer.alloc(32, 'a')` debe eliminarse
- [ ] SESSION_SECRET fallbacks deben eliminarse — fallar startup si falta

### Flujo OAuth Seguro

- [ ] `state` parameter incluye `google_auth:{userId}` para recovery de sesión perdida
- [ ] `saveSession()` con await + reintentos (3x, backoff 500ms) antes de redirect
- [ ] Refresh token se preserva: si Google no envía nuevo, merge con existente de DB
- [ ] `access_type: 'offline'` + `prompt: 'consent'` para obtener refresh token
- [ ] Scopes solicitados incluyen write para calendar + gmail
- [ ] `ensureGoogleWriteAccess()` verifica scopes antes de operaciones modify

### Redirect URIs (Google Cloud Console)

- `https://me.mima-app.com/api/auth/callback/google`
- `https://me.mima-app.com/auth/callback/google`

---

## 17. Domain Glossary

| Término                  | Definición                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Tool Call**            | JSON estructurado en respuesta de Gemini que dispara una acción (calendar/gmail)               |
| **Daily Briefing**       | Resumen automático: eventos + emails + tareas + memorias. Trigger: saludo (1x/día/timezone)    |
| **Secure Draft**         | Borrador de email que requiere confirmación explícita antes de enviar                          |
| **Refresh Token**        | Token de larga duración para obtener nuevos access tokens sin re-auth                          |
| **CSP**                  | Content-Security-Policy — middleware Express que controla qué recursos puede cargar el browser |
| **PWA Cache**            | Service Worker con Workbox: NetworkFirst para navegación, CacheFirst para assets               |
| **Model Routing**        | `selectModelForTask()` — elige gemini-2.5-flash vs gemini-2.5-pro según complejidad            |
| **Scope Validation**     | Verificación de permisos OAuth antes de operaciones write en Google APIs                       |
| **Session Recovery**     | Extraer userId del `state` parameter cuando sesión Express se pierde en callback OAuth         |
| **MimaStyle**            | Configuración de personalidad IA: neutral, profesional, creativo, zen, familiar                |
| **Memory**               | Dato persistente que el usuario pide recordar                                                  |
| **Onboarding**           | Flujo de 4 steps (0-3): idioma → bienvenida → voz → listo                                      |
| **Static Path Fallback** | 6 rutas verificadas para encontrar `dist/` en Hostinger                                        |
| **Auto-refresh Tokens**  | `oauth2Client.on('tokens')` listener que cachea tokens renovados automáticamente               |

---

## 18. Context for AI

### Quick Start Map

```
Para entender el proyecto, leer en este orden:
1. Este archivo (AGENTS.md) — reglas y mapa
2. ARCHITECTURE.md — estado detallado por módulo
3. server.ts (líneas 1-100) — config y variables
4. server.ts (líneas 257-296) — auth middleware
5. server.ts (líneas 3113-3661) — chat endpoint core
6. src/App.tsx — routing y PWA
7. src/pages/Chat.tsx — página principal
8. src/config/mimaStyles.ts — modos IA
```

### Porqués Arquitectónicos

| Decisión                                           | Razón                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Monolithic proxy en vez de BFF separado            | Simplicidad de deploy en Hostinger (1 proceso Node)                                      |
| MemoryStore para sesiones                          | MVP — sufficient para single-server deploy. Migrar cuando haya multiple instances        |
| Tool calling con JSON (no function calling nativo) | Compatibilidad con modelo Flash que no siempre soporta function calling nativo           |
| Draft-only Gmail                                   | Seguridad: evitar que IA envíe emails sin supervisión humana                             |
| System prompts en español (BUG)                    | Original del desarrollador hispanohablante. Debe migrarse a multi-idioma                 |
| Servicios en `src/services/` pero backend-only     | Evolución: empezaron como frontend, migraron a backend. Ubicación confusa pero funcional |
| `app.js` bootstrap                                 | Hostinger Passenger necesita un JS entrypoint que no sea TS                              |

### Guardrails contra Prompt Injection

1. System prompt incluye: "Nunca afirmes que Google ya tiene permiso — verifica siempre"
2. `confirmSend` requerido explícitamente — nunca implícito desde texto del usuario
3. `ensureGoogleWriteAccess()` verifica scopes reales, no depende de texto del usuario
4. Tool calls se parsean con `extractToolPayload()` + fallback a `extractToolCallFromMessage()` — doble validación

### Lo que un agente nuevo DEBE saber

1. **server.ts es el corazón** — 5573 líneas, todo el backend. Cambios aquí afectan todo.
2. **i18n es obligatorio** — 4 idiomas, 220 keys, cero hardcoded strings.
3. **El mercado principal es Finlandia** — si algo no funciona en fi, es bug crítico.
4. **Los 3 servicios bajo `src/services/` son backend-only** — no intentar usarlos en frontend.
5. **Gmail NUNCA envía sin confirmación** — esta regla no se negocia.
6. **No hay tests** — cualquier cambio requiere verificación manual.
7. **El esquema de Supabase puede estar desincronizado** — verificar estado real antes de tocar DB.
