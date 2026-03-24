import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SILENT_AUDIO_DATA_URI = 'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export const useAudioPlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mountedAudioRef = useRef(false);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

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

  const fetchAudio = useCallback(async (url: string, body?: any, useAuth = true) => {
    const makeRequest = async () => {
      const headers: Record<string, string> = {};

      if (useAuth) {
        const { data: { session } } = await supabase.auth.getSession();
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
      const message =
        typeof errorPayload === 'string'
          ? errorPayload
          : errorPayload?.details || errorPayload?.error || `Audio request failed with ${response.status}`;
      throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('Audio response was empty');
    }

    return blob;
  }, []);

  const play = useCallback(async (url: string, body?: any, useAuth = true) => {
    try {
      cleanup();
      setError(null);
      setIsPlaying(true);

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
      const normalizedBlob = blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(normalizedBlob);
      objectUrlRef.current = objectUrl;

      audio.onended = () => {
        setIsPlaying(false);
      };

      audio.onerror = () => {
        const playbackError = 'Error playing audio';
        setError(playbackError);
        setIsPlaying(false);
      };

      audio.src = objectUrl;
      audio.load();
      await waitForReady(audio);
      audio.currentTime = 0;

      try {
        await audio.play();
      } catch (playError) {
        console.warn('Primary audio playback attempt failed, retrying with data URL fallback.', playError);
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
      throw err;
    }
  }, [blobToDataUrl, cleanup, fetchAudio, unlockAudioElement, waitForReady]);

  return { play, stop, isPlaying, error, cleanup };
};
