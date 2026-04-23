# PRD-006: Auth, i18n & UX Audit — Implementation Plan

**Created:** 2026-04-23
**Status:** In Progress
**Branch:** fix/auth-i18n-audit

---

## Phase 0 Audit Results

### Already Implemented (no changes needed)

- LanguageSelector component (`src/components/LanguageSelector.tsx`) — 4 languages with flags
- Language detector utility (`src/utils/languageDetector.ts`) — localStorage > navigator > 'en'
- Auth.tsx already gates with language selector before signup form
- i18n configured with `i18next-browser-languagedetector`, all 4 locales (en/es/fi/sv)
- All locale files have ~260 keys each covering auth, onboarding, chat, profile, etc.
- OnboardingFlow.tsx fully uses `t()`
- Server services moved to `server/services/` (correct backend-only)
- `systemPrompts.ts` exists with full EN + ES translations

### What Actually Needs Fixing

#### Critical

1. **systemPrompts.ts** — FI/SV are just `...systemPromptsEn` placeholders (need real translations)
2. **server.ts `buildLocalizedSystemPrompt()`** — Context labels hardcoded in Spanish (`CONTEXTO ACTUAL`, `CAPACIDADES DISPONIBLES`)
3. **mimaStyles.ts** — `GLOBAL_MIMA_RULES` in Spanish; `buildSystemPrompt()` context labels in Spanish
4. **server.ts** — Many `langCode === 'es' ? ... : ...` patterns only handle ES/EN, not FI/SV
5. **server.ts** — Capabilities descriptions in Spanish (lines 4027-4046)
6. **server.ts** — `todayEventsSummary` default only handles ES/EN

#### Medium

7. **geminiService.ts** — Hardcoded ES/EN bilingual error messages (should handle all 4 langs)
8. **Chat.tsx:157** — Hardcoded voice ID `DODLEQrClDo8wCz460ld`
9. **geminiService.ts:110** — Hardcoded voice ID `DODLEQrClDo8wCz460ld`

---

## Implementation Tasks

### Task 1: Localize server.ts context labels, capabilities, and todayEventsSummary

- Create `getContextLabels(lang)` and `getCapabilityDescriptions(lang, ...)` helpers
- Fix `todayEventsSummary` defaults for all 4 languages
- Fix all `langCode === 'es' ? ... : ...` patterns to handle fi/sv

### Task 2: Translate GLOBAL_MIMA_RULES in mimaStyles.ts

- Make `GLOBAL_MIMA_RULES` a function taking language parameter
- Translate the 9 rules to all 4 languages
- Update `buildSystemPrompt()` to accept and use language parameter

### Task 3: Complete FI/SV system prompts in server/prompts/systemPrompts.ts

- Translate all 5 mode prompts to Finnish
- Translate all 5 mode prompts to Swedish
- Replace `...systemPromptsEn` placeholders

### Task 4: Localize geminiService.ts error messages

- Add FI/SV translations for all error messages

### Task 5: Fix hardcoded voice IDs

- Import DEFAULT_VOICE_ID from constants/voices.ts

### Task 6: Validate

- npm run lint (tsc --noEmit)
