import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const useAudioPlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

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
    audioRef.current = null;
  }, [stop]);

  const play = useCallback(async (url: string, body?: any, useAuth = true) => {
    try {
      cleanup();
      setError(null);
      setIsPlaying(true);

      // Create audio element immediately to "unlock" it on some mobile browsers
      const audio = new Audio();
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
        throw new Error(`Audio fetch failed: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      // Now set the src and play
      audio.src = objectUrl;

      audio.onended = () => {
        setIsPlaying(false);
      };

      audio.onerror = () => {
        setError('Error playing audio');
        setIsPlaying(false);
      };

      await audio.play();
    } catch (err: any) {
      console.error('Audio playback error:', err);
      setError(err.message || 'Failed to play audio');
      setIsPlaying(false);
    }
  }, [cleanup]);

  return { play, stop, isPlaying, error, cleanup };
};
