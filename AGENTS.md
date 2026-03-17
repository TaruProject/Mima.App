# AGENTS.md — Mima App

## Project Overview

**Mima** is a multilingual AI personal assistant PWA. Users can chat with Mima (powered by Gemini), connect Google Calendar and Gmail, and customize their experience with voice selection (ElevenLabs TTS) and language preferences (Finnish, Swedish, English, Spanish).

**Architecture**: React 19 SPA built with Vite 6, served by an Express 4 backend. The Express server handles API proxying (Google OAuth, Calendar, Gmail, ElevenLabs TTS) and serves the Vite-built static files in production.

**There is NO Next.js** in this project. It is entirely Vite + Express.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | ^19.0.0 |
| Build Tool | Vite | ^6.2.0 |
| Language | TypeScript | ~5.8.2 |
| Styling | Tailwind CSS | ^4.1.14 |
| Routing | react-router-dom | ^7.13.1 |
| Backend | Express | ^4.21.2 |
| Auth | @supabase/supabase-js | ^2.98.0 |
| AI | @google/genai | ^1.29.0 |
| TTS | ElevenLabs REST API | via backend proxy |
| Google APIs | googleapis | ^171.4.0 |
| i18n | i18next + react-i18next | ^25.8.18 / ^16.5.8 |
| Animations | motion (Framer Motion) | ^12.23.24 |
| Icons | lucide-react | ^0.546.0 |
| Dates | date-fns | ^4.1.0 |
| Markdown | react-markdown | ^10.1.0 |
| PWA | vite-plugin-pwa | ^1.2.0 |

---

## Project Structure

```
Mima.App/
├── server.ts              # Express backend (OAuth, TTS, Calendar, Gmail proxies)
├── index.html             # SPA entry point
├── vite.config.ts         # Vite config (React, Tailwind, PWA plugins)
├── tsconfig.json          # TypeScript config (ES2022, noEmit)
├── package.json           # Dependencies and scripts
├── .env.example           # All environment variables documented
├── public/                # Static assets
│   └── assets/            # Logo, etc.
├── src/
│   ├── main.tsx           # React root + PWA SW registration
│   ├── App.tsx            # Router, ProtectedRoute, PWA update handling
│   ├── index.css          # Tailwind v4 @theme, global CSS
│   ├── vite-env.d.ts      # Vite type declarations
│   ├── pages/
│   │   ├── Auth.tsx       # Login / Signup (Supabase email+password)
│   │   ├── Chat.tsx       # Main chat page (Gemini AI + TTS audio)
│   │   ├── Calendar.tsx   # Google Calendar integration
│   │   ├── Inbox.tsx      # Gmail integration
│   │   └── Profile.tsx    # User settings, language, voice
│   ├── components/
│   │   ├── Layout.tsx     # Bottom navigation shell
│   │   ├── InstallPWA.tsx # PWA install prompt
│   │   ├── UpdateOverlay.tsx # Mandatory update overlay
│   │   ├── onboarding/
│   │   │   └── OnboardingFlow.tsx # 5-step new user onboarding
│   │   └── ui/
│   │       ├── ActionMenu.tsx     # Chat action menu
│   │       ├── ModeBottomSheet.tsx # AI mode selector
│   │       └── Toast.tsx          # Toast notifications
│   ├── contexts/
│   │   ├── AuthContext.tsx  # Supabase auth state provider
│   │   └── ToastContext.tsx # Toast notification provider
│   ├── hooks/
│   │   └── useToast.ts     # Toast hook
│   ├── services/
│   │   └── geminiService.ts # Gemini AI calls + TTS proxy calls
│   ├── lib/
│   │   └── supabase.ts      # Supabase client initialization
│   └── i18n/
│       ├── index.ts          # i18next configuration
│       └── locales/
│           ├── en/common.json
│           ├── es/common.json
│           ├── fi/common.json
│           └── sv/common.json
└── scripts/               # Utility/debug scripts (not part of the app)
```

---

## Commands

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Starts Express + Vite dev server on http://localhost:3000.

### Build
```bash
npm run build
```
Runs `tsc && vite build`. Output goes to `dist/`.

### Production
```bash
npm start
```
Runs the Express server serving the built `dist/` folder.

### Lint (TypeScript only)
```bash
npm run lint
```
Runs `tsc --noEmit`. No ESLint or Prettier configured.

### Tests
❌ No test framework or test files exist.

---

## Environment Variables

| Variable | Purpose | Scope | Required |
|----------|---------|-------|----------|
| `GEMINI_API_KEY` | Gemini AI API authentication | ⚠️ Backend + **leaks to frontend** (see Known Issues) | ✅ Required |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Backend only | ✅ Required for Calendar/Gmail |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Backend only | ✅ Required for Calendar/Gmail |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key | Backend only | ✅ Required for voice |
| `VITE_SUPABASE_URL` | Supabase project URL | Frontend (VITE_ prefix) | ✅ Required |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Frontend (VITE_ prefix) | ✅ Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key | Backend only | ✅ Required for token storage |
| `APP_URL` | Application URL for OAuth redirects | Backend only | ✅ Required in production |
| `SESSION_SECRET` | Express session encryption key | Backend only | ⚠️ Has insecure fallback |

> ⚠️ **NEVER** put `GOOGLE_CLIENT_SECRET`, `ELEVENLABS_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` in frontend code. They must only be in `server.ts`.

---

## External Services

### Supabase
- **Used for**: Authentication (email/password), encrypted Google token storage (`user_google_tokens` table)
- **Client**: Initialized in `src/lib/supabase.ts` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- **Auth**: Managed by `AuthContext.tsx` with `onAuthStateChange` listener
- **Known table**: `user_google_tokens` (columns: `user_id`, `tokens`, `updated_at`)
- **Missing**: `profiles` table not created — profile save is simulated (see Known Issues)
- **RLS**: Unknown — no migration files exist to verify

### ElevenLabs
- **Used for**: Text-to-Speech voice output
- **Endpoint**: `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`
- **Model**: `eleven_multilingual_v2`
- **Proxy**: ✅ Correctly proxied through `server.ts` endpoints `/api/tts` and `/api/tts/preview`
- **Key**: Backend-only (server.ts)

### Google Calendar & Gmail
- **OAuth Flow**: Backend-managed via `server.ts` using `googleapis` library
- **Scopes**: `calendar.readonly`, `gmail.readonly`, `userinfo.profile`
- **Redirect URI**: `{baseUrl}/api/auth/callback/google` — dynamically built from request host
- **Registered URIs in Google Cloud**:
  - Origin: `https://me.mima-app.com`
  - Redirect: `https://me.mima-app.com/api/auth/callback/google`
  - Redirect: `https://me.mima-app.com/auth/callback/google`
- **Token storage**: Encrypted with AES-256-CBC, stored in Supabase `user_google_tokens`
- **APIs to enable in Google Cloud Console**: Google Calendar API, Gmail API

### Gemini API
- **Used for**: Chat AI responses
- **Model**: `gemini-3-flash-preview`
- **⚠️ CRITICAL**: Currently called directly from the frontend (key is exposed via `vite.config.ts` define). Must be moved to backend proxy.

---

## Internationalization (i18n)

### Supported Languages
- 🇫🇮 `fi` (Suomi) — Primary market
- 🇸🇪 `sv` (Svenska) — Secondary market
- 🇺🇸 `en` (English) — Global fallback
- 🇪🇸 `es` (Español)

### Configuration
- Library: `i18next` + `react-i18next`
- Config: `src/i18n/index.ts`
- Fallback: `en`
- Language detection: `localStorage('mima_language')` → `navigator`
- Missing key handler: logs `🚨 MISSING i18n KEY` in dev

### Translation Files
Located at `src/i18n/locales/{lang}/common.json`. Currently 70 keys per file, all symmetric.

### How to Add/Modify Translations
1. Add the key to `src/i18n/locales/en/common.json` first
2. Add the same key with translated values to `es`, `fi`, and `sv` files
3. **All 4 files MUST have identical key structures**
4. Use `t('section.key_name')` in components — never hardcode text

### ⚠️ CRITICAL i18n Rule
**Zero hardcoded text is allowed in any .tsx/.jsx file.** Every user-visible string must go through `t()`. This includes:
- Button labels
- Headings and descriptions
- Placeholder text
- Error messages
- `aria-label` attributes
- Navigation labels

### Known i18n Violations
The following components currently have hardcoded strings (see audit for full list):
- `Auth.tsx` — All English
- `Layout.tsx` — English nav labels
- `ActionMenu.tsx` — Spanish text
- `ModeBottomSheet.tsx` — Spanish mode names/descriptions
- `InstallPWA.tsx` — All English
- `UpdateOverlay.tsx` — All English
- `OnboardingFlow.tsx` step 0 — English text
- `Toast.tsx` — Spanish aria-label
- 15+ i18n keys referenced in code but missing from JSON files

---

## Onboarding

### Flow
5 steps (indices 0-4):
1. **Step 0**: Language selection (first screen)
2. **Step 1**: Welcome / introduction
3. **Step 2**: Voice selection (7 voices from ElevenLabs)
4. **Step 3**: "Everything is ready" confirmation
5. **Step 4**: Final / start chatting

### Completion Flag
- `localStorage.setItem('mima_onboarding_done', 'true')` — written **only at step 4** (last step) ✅
- `localStorage.setItem('mima_voice_id', selectedVoice)` — written at same time

### Known Issues
- Continue button is always visible on step 0 (user can skip language selection)
- Step 0 heading is hardcoded in English
- Steps 3 and 4 are both confirmation screens (redundant)

---

## Voice System

### Voice Definitions
7 voices defined. Currently **duplicated** in `OnboardingFlow.tsx` and `Profile.tsx`:

| ID | Name | Region |
|----|------|--------|
| DODLEQrClDo8wCz460ld | Mima US-1 | English US |
| L0yTtpRXzdyzQlzALhgD | Mima US-2 | English US |
| d3MFdIuCfbAIwiu7jC4a | Mima US-3 | English US |
| l4Coq6695JDX9xtLqXDE | Mima US-4 | English US |
| EXAVITQu4vr4xnSDxMaL | Mima ES-1 | Spanish |
| FGY2WhTYpP6BYn95boSj | Mima ES-2 | Spanish |
| IKne3meq5a9ay67vC7pY | Mima ES-3 | Spanish |

### TODO: Create `src/constants/voices.ts` as single source of truth

### Voice Persistence
- Stored in `localStorage('mima_voice_id')`
- **NOT synced to Supabase** — lost on browser data clear or device switch

### Preview
- Calls `/api/tts/preview` (backend)
- ⚠️ Bug in Profile.tsx: double-prefixes the data URI, breaking playback

---

## Database — Supabase

### Known Tables
| Table | Purpose | Known Columns |
|-------|---------|--------------|
| `user_google_tokens` | Encrypted Google OAuth tokens | `user_id`, `tokens` (encrypted), `updated_at` |

### Missing Tables
- `profiles` — Referenced nowhere in code. Profile save is simulated.

### Row Level Security
Unknown. No migration files or RLS policies found in the codebase.

### Migrations
❌ No migration system. No `supabase/` directory.

---

## Code Conventions

### Style
- TypeScript throughout (`.ts` / `.tsx`)
- Double quotes in JSX attributes
- Single quotes for imports
- No ESLint or Prettier configured
- Tailwind CSS v4 with `@theme` for design tokens in `index.css`

### Component Structure
- Pages in `src/pages/`
- Reusable UI in `src/components/ui/`
- Feature components in `src/components/{feature}/`
- Contexts in `src/contexts/`
- Hooks in `src/hooks/`
- Services in `src/services/`
- Configuration/utilities in `src/lib/`

### State Management
- **React Context API** only (no Zustand/Redux)
- `AuthContext` — session, user, signOut
- `ToastContext` — showToast, hideToast
- Component-level `useState` for everything else
- No global state for user preferences or chat history

### API Calls
- Google APIs: Backend proxy endpoints (`/api/calendar/events`, `/api/gmail/messages`, `/api/auth/*`)
- ElevenLabs: Backend proxy (`/api/tts`, `/api/tts/preview`)
- Gemini: ⚠️ Currently **direct from frontend** (must be moved to backend)
- Supabase: Direct client calls via `src/lib/supabase.ts`

---

## Security Rules for Agents

### ❌ NEVER Do This
- Put API keys in frontend files (`src/`)
- Call ElevenLabs, Gemini, or Claude directly from React components without the backend proxy
- Remove the `onAuthStateChange` error handling in `AuthContext.tsx`
- Hardcode text in any language in `.tsx` / `.jsx` files
- Define voice arrays outside a shared constants file
- Write `mima_onboarding_done` before the last onboarding step
- Use `process.env` for variables needed in Vite frontend code (use `import.meta.env` with `VITE_` prefix)

### ✅ ALWAYS Do This
- Pass every user-visible string through `t()` from `react-i18next`
- Verify all 4 JSON locale files have the same keys before committing
- Include the user's language in the AI system prompt
- Add error handling (`try/catch`) to any external API call
- Use the Supabase session token for authenticated backend requests (`Authorization: Bearer`)
- Test changes in Finnish (`fi`) — it's the primary market

---

## Known Issues & Technical Debt

> ⚠️ Read these before making any changes. These are active bugs from the March 2026 audit.

1. **🔴 GEMINI_API_KEY is exposed in frontend** — `vite.config.ts` injects it via `define`. Must route all Gemini calls through `/api/chat` backend endpoint.
2. **🔴 AI always responds in English** — System prompt in `geminiService.ts` has no language parameter.
3. **🔴 15+ i18n keys are missing** from JSON files. User sees raw key strings like "chat.welcome_message".
4. **🔴 Massive hardcoded string violations** — Auth.tsx (English), ActionMenu/ModeBottomSheet (Spanish), Layout (English), InstallPWA/UpdateOverlay (English).
5. **🔴 Profile save is fake** — `setTimeout(1500)` then success toast. No Supabase call.
6. **🔴 Chat history is not persisted** — Lost on every reload.
7. **🟡 Voice data duplicated** in OnboardingFlow.tsx and Profile.tsx — needs central `constants/voices.ts`.
8. **🟡 Sign out doesn't clear localStorage** — Previous user's preferences persist.
9. **🟡 Profile voice preview is broken** — Double data URI prefix.
10. **🟡 Calendar dates/days always in English** — Not locale-aware.
11. **🟡 No Error Boundary** — Render errors crash entire app.
12. **🟡 OAuth logic duplicated** between Calendar.tsx and Inbox.tsx.
13. **🔵 No testing** — Zero test files or test framework.
14. **🔵 No linting** — No ESLint/Prettier.
15. **🔵 `better-sqlite3`** listed in dependencies but never used.

---

## Workflow for Agents

### Before Modifying Anything
1. Read this `AGENTS.md` completely
2. Check if the area you're touching has known issues listed above
3. If adding user-visible text: add it to all 4 JSON locale files FIRST
4. If calling an external API: verify the key goes through the backend proxy
5. If modifying voices: use the central constants file (once created)

### Before Committing
1. Search for hardcoded strings in `.tsx` files: `grep -rn '"[A-Z]' src/ --include="*.tsx"`
2. Verify all 4 JSON files have matching keys: compare key counts
3. Run `npm run lint` (tsc --noEmit) to check for TypeScript errors
4. Verify no API keys appear in `src/` files
5. Test navigation with Finnish (`fi`) language selected
