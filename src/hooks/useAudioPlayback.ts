import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  computeCacheHash,
  getCachedBlob,
  setCachedBlob,
  isOptimizationEnabled,
  isValidVoiceId,
} from '../utils/ttsCache';

const SILENT_AUDIO_DATA_URI =
  'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export type TtsStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

export const useAudioPlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>('idle');
  const ttsStatusRef = useRef<TtsStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mountedAudioRef = useRef(false);
  const preloadCacheRef = useRef<Map<string, Blob>>(new Map());

  const updateTtsStatus = useCallback((status: TtsStatus) => {
    ttsStatusRef.current = status;
    setTtsStatus(status);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    if (ttsStatusRef.current === 'playing') {
      updateTtsStatus('ready');
    }
  }, [updateTtsStatus]);

  const cleanup = useCallback(() => {
    stop();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.oncanplaythrough = null;
      if (mountedAudioRef.current && audioRef.current.parentElement) {
        audioRef.current.parentElement.removeChild(audioRef.current);
      }
      mountedAudioRef.current = false;
      audioRef.current.src = '';
    }
    audioRef.current = null;
  }, [stop]);

  const waitForReady = useCallback((audio: HTMLAudioElement) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finalize = (callback: () => void) => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('loadedmetadata', handleReady);
        audio.removeEventListener('loadeddata', handleReady);
        audio.removeEventListener('canplay', handleReady);
        audio.removeEventListener('canplaythrough', handleReady);
        audio.removeEventListener('error', handleError);
        window.clearTimeout(timeoutId);
        callback();
      };

      const handleReady = () => finalize(resolve);
      const handleError = () => finalize(() => reject(new Error('Error loading audio')));
      const timeoutId = window.setTimeout(() => finalize(resolve), 2000);

      audio.addEventListener('loadedmetadata', handleReady, { once: true });
      audio.addEventListener('loadeddata', handleReady, { once: true });
      audio.addEventListener('canplay', handleReady, { once: true });
      audio.addEventListener('canplaythrough', handleReady, { once: true });
      audio.addEventListener('error', handleError, { once: true });
    });
  }, []);

  const unlockAudioElement = useCallback(async (audio: HTMLAudioElement) => {
    try {
      audio.muted = true;
      audio.src = SILENT_AUDIO_DATA_URI;
      audio.load();
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Ignore unlock failures; we still try normal playback next.
    } finally {
      audio.muted = false;
      audio.removeAttribute('src');
      audio.load();
    }
  }, []);

  const blobToDataUrl = useCallback((blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Failed to convert audio blob'));
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const fetchAudio = useCallback(
    async (url: string, body?: any, useAuth = true, abortSignal?: AbortSignal) => {
      const makeRequest = async () => {
        const headers: Record<string, string> = {};

        if (useAuth) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
          }
        }

        return fetch(url, {
          method: body ? 'POST' : 'GET',
          headers: {
            ...headers,
            ...(body && { 'Content-Type': 'application/json' }),
          },
          credentials: 'include',
          cache: 'no-store',
          signal: abortSignal ?? undefined,
          ...(body && { body: JSON.stringify(body) }),
        });
      };

      let response = await makeRequest();

      if (response.status === 401 && useAuth) {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          response = await makeRequest();
        }
      }

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const errorPayload = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : await response.text().catch(() => '');

        if (response.status === 429) {
          throw new Error('TTS_RATE_LIMITED');
        }
        if (response.status >= 500) {
          throw new Error('TTS_SERVER_ERROR');
        }

        const message =
          typeof errorPayload === 'string'
            ? errorPayload
            : errorPayload?.details ||
              errorPayload?.error ||
              `Audio request failed with ${response.status}`;
        throw new Error(message);
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error('Audio response was empty');
      }

      return blob;
    },
    []
  );

  const playBlob = useCallback(
    async (blob: Blob) => {
      const audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.autoplay = false;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      mountedAudioRef.current = true;
      audioRef.current = audio;

      await unlockAudioElement(audio);

      const normalizedBlob = blob.type
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(normalizedBlob);
      objectUrlRef.current = objectUrl;

      audio.onended = () => {
        setIsPlaying(false);
        updateTtsStatus('ready');
      };

      audio.onerror = () => {
        setError('Error playing audio');
        setIsPlaying(false);
        updateTtsStatus('error');
      };

      audio.src = objectUrl;
      audio.load();
      await waitForReady(audio);
      audio.currentTime = 0;

      try {
        await audio.play();
      } catch (playError) {
        console.warn(
          'Primary audio playback attempt failed, retrying with data URL fallback.',
          playError
        );
        const fallbackDataUrl = await blobToDataUrl(normalizedBlob);
        audio.src = fallbackDataUrl;
        audio.load();
        await waitForReady(audio);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        await audio.play();
      }
    },
    [blobToDataUrl, unlockAudioElement, waitForReady]
  );

  const play = useCallback(
    async (url: string, body?: any, useAuth = true) => {
      try {
        cleanup();
        setError(null);
        setIsPlaying(true);
        updateTtsStatus('loading');

        const audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.autoplay = false;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        mountedAudioRef.current = true;
        audioRef.current = audio;
        await unlockAudioElement(audio);
        const blob = await fetchAudio(url, body, useAuth);
        const normalizedBlob = blob.type
          ? blob
          : new Blob([await blob.arrayBuffer()], { type: 'audio/mpeg' });
        const objectUrl = URL.createObjectURL(normalizedBlob);
        objectUrlRef.current = objectUrl;

        audio.onended = () => {
          setIsPlaying(false);
          updateTtsStatus('idle');
        };

        audio.onerror = () => {
          const playbackError = 'Error playing audio';
          setError(playbackError);
          setIsPlaying(false);
          updateTtsStatus('error');
        };

        audio.src = objectUrl;
        audio.load();
        await waitForReady(audio);
        audio.currentTime = 0;
        updateTtsStatus('playing');

        try {
          await audio.play();
        } catch (playError) {
          console.warn(
            'Primary audio playback attempt failed, retrying with data URL fallback.',
            playError
          );
          const fallbackDataUrl = await blobToDataUrl(normalizedBlob);
          audio.src = fallbackDataUrl;
          audio.load();
          await waitForReady(audio);
          await new Promise((resolve) => window.setTimeout(resolve, 120));
          await audio.play();
        }
      } catch (err: any) {
        console.error('Audio playback error:', err);
        setError(err.message || 'Failed to play audio');
        setIsPlaying(false);
        updateTtsStatus('error');
        throw err;
      }
    },
    [blobToDataUrl, cleanup, fetchAudio, unlockAudioElement, waitForReady]
  );

  const preload = useCallback(
    async (text: string, voiceId: string) => {
      if (!isOptimizationEnabled()) return;
      if (!isValidVoiceId(voiceId)) return;

      try {
        const hash = await computeCacheHash(text, voiceId);
        if (preloadCacheRef.current.has(hash)) return;

        const cached = await getCachedBlob(hash);
        if (cached) {
          preloadCacheRef.current.set(hash, cached);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
          const blob = await fetchAudio('/api/tts', { text, voiceId }, true, controller.signal);
          clearTimeout(timeoutId);

          await setCachedBlob(hash, voiceId, blob);
          preloadCacheRef.current.set(hash, blob);
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (err?.name === 'AbortError') {
            console.log('TTS_PROXY_TIMEOUT: preload aborted after 30s');
          } else if (err?.message === 'TTS_RATE_LIMITED') {
            console.log('TTS_RATE_LIMITED: preload skipped due to rate limit');
          } else if (err?.message === 'TTS_SERVER_ERROR') {
            console.log('TTS_SERVER_ERROR: preload skipped, server error');
          } else {
            console.log('TTS_PROXY_ERROR: preload failed', err?.message);
          }
        }
      } catch (err) {
        console.warn('TTS preload error:', err);
      }
    },
    [fetchAudio]
  );

  const playCached = useCallback(
    async (text: string, voiceId: string) => {
      if (!isOptimizationEnabled()) {
        return play('/api/tts', { text, voiceId });
      }

      const startTime = performance.now();

      try {
        cleanup();
        setError(null);
        updateTtsStatus('loading');
        setIsPlaying(true);

        const hash = await computeCacheHash(text, voiceId);
        let blob = preloadCacheRef.current.get(hash) ?? (await getCachedBlob(hash));

        if (!blob) {
          console.log(`TTS_CACHE_MISS hash=${hash} — fetching synchronously`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          try {
            blob = await fetchAudio('/api/tts', { text, voiceId }, true, controller.signal);
            clearTimeout(timeoutId);
            await setCachedBlob(hash, voiceId, blob);
            preloadCacheRef.current.set(hash, blob);
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            if (fetchErr?.name === 'AbortError') {
              console.log('TTS_PROXY_TIMEOUT: sync fetch aborted after 2s');
              throw new Error(
                'Audio generation is taking longer than expected. Try again in a moment.'
              );
            } else if (fetchErr?.message === 'TTS_RATE_LIMITED') {
              console.log('TTS_RATE_LIMITED: voice service rate limited');
              throw new Error('Voice service rate limited. Please try again later.');
            } else if (fetchErr?.message === 'TTS_SERVER_ERROR') {
              console.log('TTS_SERVER_ERROR: voice service temporarily unavailable');
              throw new Error('Voice service temporarily unavailable.');
            } else {
              console.log('TTS_PROXY_ERROR:', fetchErr?.message);
            }
            throw fetchErr;
          }
        }

        const elapsed = performance.now() - startTime;
        console.log(`TTS playback started in ${elapsed.toFixed(0)}ms`);

        updateTtsStatus('playing');
        await playBlob(blob);
      } catch (err: any) {
        console.error('Cached audio playback error:', err);
        setError(err.message || 'Failed to play audio');
        setIsPlaying(false);
        updateTtsStatus('error');
        throw err;
      }
    },
    [cleanup, fetchAudio, play, playBlob]
  );

  const checkCacheStatus = useCallback(
    async (text: string, voiceId: string): Promise<TtsStatus> => {
      if (!isOptimizationEnabled()) return 'idle';

      try {
        const hash = await computeCacheHash(text, voiceId);
        if (preloadCacheRef.current.has(hash)) return 'ready';

        const cached = await getCachedBlob(hash);
        if (cached) {
          preloadCacheRef.current.set(hash, cached);
          return 'ready';
        }
      } catch {
        // Fall through
      }
      return 'idle';
    },
    []
  );

  return {
    play,
    playCached,
    preload,
    stop,
    isPlaying,
    error,
    cleanup,
    ttsStatus,
    checkCacheStatus,
  };
};
