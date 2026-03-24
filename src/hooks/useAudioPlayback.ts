import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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

  const play = useCallback(async (url: string, body?: any, useAuth = true) => {
    try {
      cleanup();
      setError(null);
      setIsPlaying(true);

      const audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      mountedAudioRef.current = true;
      audioRef.current = audio;

      const headers: Record<string, string> = {};
      
      if (useAuth) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...headers,
          ...(body && { 'Content-Type': 'application/json' }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Audio fetch failed: ${response.status} ${errorText}`.trim());
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
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

      try {
        await audio.play();
      } catch (playError) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        await audio.play();
      }
    } catch (err: any) {
      console.error('Audio playback error:', err);
      setError(err.message || 'Failed to play audio');
      setIsPlaying(false);
      throw err;
    }
  }, [cleanup, waitForReady]);

  return { play, stop, isPlaying, error, cleanup };
};
