import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const useVoiceRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const getOrCreateStream = useCallback(async () => {
    if (streamRef.current && streamRef.current.active) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await getOrCreateStream();
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstart = () => setIsRecording(true);
      recorder.onstop = () => {
        setIsRecording(false);
      };

      recorder.start();
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setError(err.message || 'Could not access microphone');
    }
  }, [getOrCreateStream]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        try {
          setIsTranscribing(true);
          const { data: { session } } = await supabase.auth.getSession();
          
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: {
              ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
            },
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Transcription failed: ${response.status}`);
          }

          const result = await response.json();
          setTranscript(result.text);
          resolve(result.text);
        } catch (err: any) {
          console.error('Transcription error:', err);
          setError(err.message || 'Failed to transcribe audio');
          resolve(null);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  return { isRecording, isTranscribing, transcript, error, startRecording, stopRecording };
};
