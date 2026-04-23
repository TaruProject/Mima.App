# PRD-006 — Auth, i18n, and UX Remediation Plan

**Date:** 2026-04-23  
**Owner:** Codex  
**Type:** bugfix + i18n + security-hardening  
**Branch target:** `fix/auth-i18n-audit`

## Scope

Fix critical registration/auth localization issues and remove remaining Spanish-only backend prompt/tool paths that block FI/SV quality.

## Why this change

1. Signup fails with `Database error saving new user` in affected environments.
2. Language selection exists but is not fully persisted through signup/profile creation.
3. Backend still contains Spanish-hardcoded prompt/tool instruction blocks.
4. `systemPrompts.ts` FI/SV currently fallback to English placeholders.

## Affected modules

- `src/pages/Auth.tsx`
- `src/components/LanguageSelector.tsx`
- `src/i18n/locales/{en,es,fi,sv}/common.json`
- `server.ts`
- `server/prompts/systemPrompts.ts`
- `supabase/migrations/*` (new migration for trigger hardening)

## Execution plan

### 1) Signup flow hardening

- Send selected language in Supabase signup metadata (`options.data.language`).
- Keep language selector visible ahead of signup fields and apply language immediately via `i18n.changeLanguage`.
- Improve auth error mapping with translated, user-facing messages for common signup/login failures.

### 2) Database trigger hardening

- Add migration to replace `public.handle_new_user()` with idempotent logic:
  - Insert/Upsert `public.profiles` with language from `raw_user_meta_data.language` fallback `'en'`.
  - Insert/Upsert `public.user_preferences` when table exists.
  - Avoid hard failure if auxiliary table is absent in partially-migrated environments.

### 3) Backend i18n completion

- Remove Spanish-only literals in chat prompt assembly.
- Introduce localized helper builders for:
  - tool instructions
  - capability descriptions
  - status notices
  - strict guidance lines
- Use `resolvedLangCode` consistently (not request `language` only) with fallback `'en'`.

### 4) System prompt completion

- Provide real FI/SV prompt sets in `server/prompts/systemPrompts.ts` for all modes.

### 5) Verification

- `npm run lint`
- `node scripts/check-i18n.js`
- Manual smoke:
  - `/auth` language selected -> labels switch immediately
  - signup payload includes language metadata
  - backend prompt assembly uses non-Spanish strings for `fi`/`sv`

## Dependencies and assumptions

- Supabase migrations are applied in target environment.
- Existing RLS and auth policies are already active as baseline.

## Rollback plan

1. Revert migration file and deploy previous server build.
2. Revert auth UI changes in `Auth.tsx`.
3. Revert prompt localization helpers in `server.ts`.
4. Re-run `npm run lint` to confirm rollback integrity.

