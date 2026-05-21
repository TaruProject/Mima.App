# CODEBASE_STATE_REPORT.md

## 1. Resumen Ejecutivo

Mima App v2.7.0 es una PWA monolítica React 19 + Express que proporciona un asistente personal de IA multilingüe con integración completa de Google Calendar, Gmail y TTS. El stack incluye Gemini 2.5 (Flash/Pro), Supabase para persistencia, y ElevenLabs para voz. Arquitectura proxy monolítica con 6080 líneas en server.ts. Producto principal en Finlandia/Suecia, soportando 4 idiomas. Estado actual: funcional con 13 bugs críticos conocidos (ver Sección 11).

## 2. Stack Tecnológico Real (Versiones)

| Tecnología   | Versión       | Archivo Referencia |
| ------------ | ------------- | ------------------ |
| React        | 19.0.0        | @/package.json:39  |
| Vite         | 6.2.0         | @/package.json:49  |
| TypeScript   | 5.8.2         | @/package.json:47  |
| Express      | 4.21.2        | @/package.json:31  |
| Gemini AI    | 1.29.0        | @/package.json:19  |
| Supabase     | 2.98.0        | @/package.json:20  |
| TailwindCSS  | 4.1.14        | @/package.json:22  |
| React Router | 7.13.1        | @/package.json:43  |
| ElevenLabs   | N/A (proxy)   | @/server.ts:1820   |
| Node.js      | 22.14.0 (dev) | @/package.json:25  |

Entorno: Windows 10, Hostinger deployment, PWA con Service Worker (Workbox). Build system: npm scripts con Vite + tsc.

## 3. Árbol de Directorios Crítico

```
Mima.App/
├── server.ts (6080 líneas - backend monolítico)
├── app.js (143 líneas - Hostinger bootstrap)
├── src/
│   ├── pages/ (6 archivos - React pages)
│   │   ├── Chat.tsx (1043 líneas - chat principal)
│   │   ├── Inbox.tsx (648 líneas - Gmail UI)
│   │   ├── Profile.tsx (543 líneas - configuración)
│   │   ├── Calendar.tsx (298 líneas - vista mensual)
│   │   ├── Auth.tsx (107 líneas - login/signup)
│   │   └── GoogleCallback.tsx (74 líneas - OAuth redirect)
│   ├── components/ (8 archivos)
│   │   ├── Layout.tsx (70 líneas - navegación bottom)
│   │   ├── ErrorBoundary.tsx (77 líneas - catch errores)
│   │   ├── InstallPWA.tsx (139 líneas - install prompt)
│   │   ├── UpdateOverlay.tsx (81 líneas - PWA updates)
│   │   ├── onboarding/OnboardingFlow.tsx (225 líneas - 4 pasos)
│   │   └── ui/ (4 archivos - componentes base)
│   ├── contexts/ (2 archivos)
│   │   ├── AuthContext.tsx (103 líneas - Supabase auth state)
│   │   └── ToastContext.tsx (44 líneas - notificaciones)
│   ├── hooks/ (5 archivos - custom hooks)
│   │   ├── useGoogleConnection.ts (156 líneas - OAuth state)
│   │   ├── useVoiceRecording.ts (96 líneas - STT)
│   │   ├── useAudioPlayback.ts (212 líneas - TTS playback)
│   │   ├── useToast.ts (10 líneas - toast hook)
│   │   └── useAudioPlayback.ts (212 líneas - TTS playback)
│   ├── services/ (4 archivos - backend-only ⚠️ roto en frontend)
│   │   ├── geminiService.ts (144 líneas - chat proxy)
│   │   ├── userPreferencesService.ts (236 líneas - Supabase CRUD)
│   │   ├── userMemoryService.ts (144 líneas - memoria persistente)
│   │   └── userTaskService.ts (189 líneas - tareas CRUD)
│   ├── constants/voices.ts (26 líneas - 16 voces ElevenLabs)
│   ├── config/mimaStyles.ts (383 líneas - 5 modos IA)
│   ├── i18n/ (42 líneas - react-i18next setup + 4 locales)
│   └── lib/supabase.ts (63 líneas - cliente singleton)
├── supabase/migrations/ (3 archivos SQL)
├── scripts/ (3 archivos - build helpers)
└── public/ (assets + .htaccess)
```

## 4. Sistema de Rutas & Navegación

React Router v7 con rutas protegidas. Layout bottom navigation en español.

| Ruta                        | Componente     | Protegida | Descripción                   | Archivo                            |
| --------------------------- | -------------- | --------- | ----------------------------- | ---------------------------------- |
| `/`                         | Chat           | ✅        | Chat principal con IA         | @/src/pages/Chat.tsx:274           |
| `/calendar`                 | Calendar       | ✅        | Vista mensual Google Calendar | @/src/pages/Calendar.tsx           |
| `/inbox`                    | Inbox          | ✅        | Gmail inbox + draft AI        | @/src/pages/Inbox.tsx              |
| `/profile`                  | Profile        | ✅        | Configuración usuario         | @/src/pages/Profile.tsx            |
| `/auth`                     | Auth           | ❌        | Login/Signup Supabase         | @/src/pages/Auth.tsx:263           |
| `/api/auth/callback/google` | GoogleCallback | ❌        | OAuth redirect                | @/src/pages/GoogleCallback.tsx:265 |

ProtectedRoute: verifica AuthContext session, redirect a /auth si no autenticado (@/src/App.tsx:35-51).

## 5. Autenticación & Autorización (Google OAuth + RBAC)

Dual auth: Supabase JWT (Bearer) + Express session (cookies). Google OAuth para Calendar/Gmail.

**Flujo OAuth** (@/server.ts:1240-1522):

1. `/api/auth/url` → genera Google URL con scopes write (@/server.ts:1240)
2. Usuario → Google consent → redirect `/api/auth/callback/google`
3. Token exchange → encrypt AES-256-CBC → persist Supabase + session
4. `saveSession()` con await antes redirect (@/server.ts:228)

**Scopes requeridos** (@/server.ts:352-366):

- calendar, gmail.readonly, gmail.compose, gmail.send, userinfo.profile

**RBAC**: RLS Supabase por user_id. Service role bypass en backend only.

**Verificación permisos**: `ensureGoogleWriteAccess()` antes write ops (@/server.ts:484).

## 6. Capa de Datos (Supabase + Tipos TS)

4 tablas principales. RLS enabled. Encriptación tokens AES-256-CBC.

| Tabla                | PK/FK                     | Columnas Clave                                              | RLS               | Propósito                 |
| -------------------- | ------------------------- | ----------------------------------------------------------- | ----------------- | ------------------------- |
| `profiles`           | id (UUID→auth.users)      | name, username, language, voice_id, avatar_url              | ✅ own            | Perfil usuario            |
| `user_preferences`   | user_id (UUID→auth.users) | onboarding_done, voice_id, language, last_daily_briefing_at | ✅ own            | Preferencias + onboarding |
| `chat_messages`      | id (UUID auto)            | user_id, role, content, mode, audio_data                    | ✅ own            | Historial chat            |
| `user_google_tokens` | user_id (UUID→auth.users) | tokens (encrypted)                                          | ❌ (service role) | Tokens OAuth encriptados  |
| `user_memories`      | id (UUID auto)            | user_id, memory_key (UNIQUE), memory_text, category         | ✅ own            | Memorias persistentes     |
| `user_tasks`         | id (UUID auto)            | user_id, task_key (UNIQUE), title, status, due_at           | ✅ own            | Tareas usuario            |

**Interfaces TS**: definidas en services (UserPreferences, ChatMessage, etc.).

**Encriptación**: `encrypt()`/`decrypt()` con scrypt(secret, 'salt', 32) → AES-256-CBC (@/server.ts:152-168).

## 7. Integraciones Externas (Express Proxy + Gemini 2.5)

Todas APIs externas proxificadas por server.ts. No fetch directo desde frontend.

**Gemini 2.5**:

- `selectModelForTask()`: Flash (95%) vs Pro (attachments/complex) (@/server.ts:3253)
- Tool calling: JSON parse → execute → response (@/server.ts:3385)
- Timeout 30s, retry backoff (@/server.ts:30-31)

**Google APIs** (Calendar/Gmail):

- `getUserTokens()`: session cache + Supabase fallback (@/server.ts:4874)
- Auto-refresh: `oauth2Client.on('tokens')` listener (@/server.ts:4934)
- `listCalendarEvents()`, `createCalendarEvent()`, etc. (@/server.ts:2086+)

**ElevenLabs TTS**: proxy `/api/tts` (@/server.ts:1820)

**Supabase**: cliente singleton en frontend (@/src/lib/supabase.ts)

## 8. Gestión de Estado & Hooks

React hooks + context. No Zustand/Redux. Estado local + Supabase.

**Contextos**:

- AuthContext: session/user/isLoading/signOut (@/src/contexts/AuthContext.tsx)
- ToastContext: showToast/hideToast (@/src/contexts/ToastContext.tsx)

**Custom Hooks**:

- useGoogleConnection: isConnected/hasWriteAccess/reconnectRequired (@/src/hooks/useGoogleConnection.ts)
- useVoiceRecording: start/stop recording + STT via `/api/transcribe` (@/src/hooks/useVoiceRecording.ts)
- useAudioPlayback: TTS play con iOS unlock (@/src/hooks/useAudioPlayback.ts)
- useToast: acceso ToastContext (@/src/hooks/useToast.ts)

**Persistencia**: localStorage (onboarding_done, voice_id, language) + Supabase (todo).

## 9. Reglas de Negocio & Validaciones

**Gmail Draft-Only** (BR-1): `confirmSend: true` requerido para `/api/gmail/drafts/:id/send` (@/server.ts:5653)

**Scope Validation** (BR-2): `ensureGoogleWriteAccess()` antes write ops (@/server.ts:484)

**Daily Briefing** (BR-3): trigger en saludo + 1x/día/timezone (@/server.ts:704)

**Memorias/Tareas** (BR-4): aisladas por user_id, RLS Supabase

**Idioma Response** (BR-5): system prompts en español (BUG) → migrar multi-lang

**Validaciones**: Zod/Yup no usado. Validación manual en endpoints.

## 10. Manejo de Errores & Logging

**Frontend**: ErrorBoundary catch render errors (@/src/components/ErrorBoundary.tsx). Auth error detect por string match (@/src/pages/Chat.tsx:481).

**Backend**: try/catch en endpoints. Console.log extensive (152 en @/server.ts). Logs in-memory para debug (@/server.ts:46).

**TTS/STT**: AbortController para cancel (@/src/hooks/useAudioPlayback.ts:105).

**API Errors**: HTTP status codes + JSON {error, errorCode} (@/server.ts:2038+).

## 11. Deuda Técnica & `⚠️ VERIFY`

**CRÍTICO (🔴)**:

- BUG-001: System prompts 100% español → no funciona fi/sv (@/server.ts:3399-3586)
- BUG-002: Salt estático 'salt' + key fallback Buffer.alloc(32, 'a') → tokens descifrables (@/server.ts:134-145)
- BUG-003: SESSION_SECRET fallbacks conocidos → sesiones forjables (@/server.ts:133,190)
- BUG-004: process.env en servicios frontend → crash browser (@/src/services/\*.ts:6-7)
- BUG-005: node:crypto imports en frontend → build fail (@/src/services/user\*.ts:1)

**IMPORTANTE (🟡)**:

- BUG-006: MemoryStore sessions en prod → memory leak (@/server.ts:189)
- BUG-007: Sin rate limiting → abuso potencial (@/server.ts)
- BUG-008: Sin timeout Gemini → request puede bloquear (@/server.ts:3595)
- BUG-009: Gmail draft responses español only (@/server.ts:5012-5254)
- BUG-010: Calendar format español only (@/server.ts:2021-2131)

**MENOR (🟢)**:

- BUG-013: DEFAULT_VOICE_ID hardcoded → inconsistente (5 lugares)
- BUG-014: ~661 líneas código muerto (@/server.ts:3623-4715)
- BUG-016: Dos ESLint configs conflict → confusión (@/.eslintrc.json + @/eslint.config.js)
- BUG-017: React import innecesario (@/src/App.tsx:1)
- BUG-019: Assets externos i.postimg.cc → dependencia terceros (@/index.html:12-29)

**BK-001**: Localización backend multi-idioma (alto esfuerzo)
**BK-002**: Eliminar fallbacks SESSION_SECRET (bajo)
**BK-003**: Mover 3 servicios a backend-only (medio)

## 12. Recomendaciones Arquitectónicas Inmediatas

1. **Seguridad crítica**: Eliminar fallbacks SESSION_SECRET, salt estático, key fallback. Implementar startup failure sin env vars críticas.
2. **Backend refactor**: Separar server.ts en módulos (auth, chat, calendar, gmail, utils).
3. **Localización**: Migrar system prompts + tool responses a multi-idioma con langCode.
4. **Servicios frontend**: Eliminar process.env/node:crypto de src/services/ (backend-only).
5. **Debug endpoints**: Proteger con IS_PROD guards o eliminar en prod.
6. **Testing**: Agregar Vitest + testing framework.
7. **Session store**: Migrar MemoryStore a Supabase/Redis.

## 13. Glosario de Referencias Rápidas

| Término              | Definición                                                            | Archivo                                        |
| -------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| Tool Call            | JSON Gemini → execute action (calendar/gmail)                         | @/server.ts:2897                               |
| Daily Briefing       | Resumen auto: eventos + emails + tareas + memorias                    | @/server.ts:859                                |
| Secure Draft         | Borrador email requiere confirmación explícita                        | BR-1                                           |
| Refresh Token        | Token larga duración para nuevos access tokens                        | @/server.ts:1447                               |
| CSP                  | Content-Security-Policy headers unificado                             | @/server.ts:180                                |
| PWA Cache            | Service Worker Workbox: NetworkFirst nav, CacheFirst assets           | @/vite.config.ts:16                            |
| Model Routing        | selectModelForTask: Flash vs Pro según complejidad                    | @/server.ts:3253                               |
| Scope Validation     | Verificación permisos OAuth antes write                               | @/server.ts:484                                |
| Session Recovery     | Extraer userId de state parameter si session perdida                  | @/server.ts:1369                               |
| MimaStyle            | Config personalidad IA: neutral, profesional, creativo, zen, familiar | @/src/config/mimaStyles.ts                     |
| Memory               | Dato persistente que usuario pide recordar                            | @/server.ts:616                                |
| Onboarding           | Flujo 4 steps: idioma → bienvenida → voz → listo                      | @/src/components/onboarding/OnboardingFlow.tsx |
| Static Path Fallback | 6 rutas verificadas para encontrar dist/ en Hostinger                 | @/server.ts:5986                               |
