# PRD-003: TTS Playback Latency Optimization

## Problem

Current TTS flow: Click → POST /api/tts → Wait ElevenLabs (~3s) → Download blob → Play.
Zero caching. Synchronous blocking. No precomputation.

## Architecture

### 1. ttsCache.ts (IndexedDB + Memory LRU)

- DB: `mima_tts_cache`, Store: `audio_blobs`
- Key: `SHA-256(text.trim().toLowerCase() + voice_id).slice(0,16)`
- Schema: `{ hash, voice_id, blob, created_at, size_bytes, last_accessed }`
- Memory cache: `Map<string, { blob, lastAccessed }>` — first lookup tier
- 50MB limit with LRU eviction (delete oldest `last_accessed` entries)
- Feature toggle: `localStorage('mima_tts_optimization')` → `'v2'` | `'legacy'`
- Voice ID validation against `voices.ts` allowlist
- Cache invalidation on voice_id change

### 2. useAudioPlayback.ts Refactor

- New state: `status: 'idle' | 'loading' | 'ready' | 'playing' | 'error'`
- `preload(text, voiceId)`: background pre-generation via requestIdleCallback
- `playCached(text, voiceId)`: cache-first lookup, fallback to network
- Preserve: iOS AudioContext unlock, AbortController teardown, data URL fallback
- 2s timeout on network fetch with loading state
- Error handling: 429/5xx → toast with "Voice service temporarily unavailable"

### 3. Server /api/tts Optimization

- Add `Cache-Control: private, max-age=86400` (browser-side caching)
- Add `ETag` header from content hash
- Voice ID validation against allowlist
- 30s timeout on ElevenLabs fetch with AbortController
- Reduce middleware: move authenticateSupabaseUser before body parsing

### 4. Chat.tsx Play Button States

- `idle`: ▶️ (Play icon)
- `generating`: spinner (non-blocking)
- `ready`: 🎵 green badge (cached)
- `playing`: ⏸️ (Pause/Square icon)
- Pre-generation: `useEffect` on assistant messages via `requestIdleCallback`
- No changes to message rendering logic or Gemini flows

### 5. Feature Toggle

- `localStorage('mima_tts_optimization')`:
  - `'v2'` (default): cache + pre-generation
  - `'legacy'`: original synchronous flow
- Instant rollback without redeployment

### i18n Keys Added

- `chat.tts_generating`, `chat.tts_cached`, `chat.tts_unavailable`

## Data Flow (v2)

```
Message renders → requestIdleCallback → preload(text, voiceId) →
  cache.get(hash) → HIT: store in memory →
  MISS: POST /api/tts → store in IndexedDB + memory

User clicks play → playCached(text, voiceId) →
  memory.get(hash) → HIT: instant playback (<100ms) →
  IndexedDB.get(hash) → HIT: playback (<200ms) →
  MISS: show loading → POST /api/tts → playback → store in cache
```

## Rollback Plan

- Set `localStorage('mima_tts_optimization', 'legacy')` → instant revert to original flow
- No server changes required for rollback
- Pre/post deployment: same behavior with toggle
