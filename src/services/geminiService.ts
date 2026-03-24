export interface ChatError {
  message: string;
  errorCode?: string;
  details?: string;
}

export interface ChatResponse {
  text?: string;
  error?: string;
  errorCode?: string;
  details?: string;
}

interface ChatAttachmentPayload {
  name: string;
  mimeType: string;
  data: string;
  size: number;
}

export async function generateChatResponse(
  message: string,
  mode: string,
  language?: string,
  history?: Array<{ role: string; content: string }>,
  authToken?: string,
  attachments?: ChatAttachmentPayload[],
): Promise<string> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30s timeout

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      },
      body: JSON.stringify({
        message,
        mode,
        language: language || 'en',
        history: history || [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attachments: attachments || [],
      }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const data: ChatResponse = await response.json();

    if (!response.ok) {
      console.error('Chat API error:', {
        status: response.status,
        error: data.error,
        errorCode: data.errorCode,
        details: data.details
      });

      // Return specific error message based on error code
      if (data.errorCode === 'GEMINI_NOT_CONFIGURED') {
        return language === 'es'
          ? "⚠️ El servicio de IA no está configurado. Por favor contacta al administrador."
          : "⚠️ AI service is not configured. Please contact the administrator.";
      }
      if (data.errorCode === 'INVALID_API_KEY') {
        return language === 'es'
          ? "⚠️ Error en la clave de API. Por favor intenta más tarde."
          : "⚠️ API Key error. Please try again later.";
      }
      if (data.errorCode === 'QUOTA_EXCEEDED') {
        return language === 'es'
          ? "⚠️ Se excedió el límite de uso. Por favor intenta en unos minutos."
          : "⚠️ Usage quota exceeded. Please try again in a few minutes.";
      }

      return data.error || (language === 'es'
        ? "Lo siento, estoy teniendo problemas. Por favor intenta de nuevo."
        : "I'm sorry, I'm having trouble. Please try again.");
    }

    if (!data.text) {
      console.error('Chat API returned empty text');
      return language === 'es'
        ? "Lo siento, no pude generar una respuesta. Por favor intenta de nuevo."
        : "I'm sorry, I couldn't generate a response. Please try again.";
    }

    return data.text;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error('Chat API timeout');
      return language === 'es'
        ? "⏱️ La respuesta está tardando más de lo esperado. Por favor intenta de nuevo."
        : "⏱️ Response is taking longer than expected. Please try again.";
    }

    console.error('Chat API Error:', error);
    return language === 'es'
      ? "Lo siento, estoy teniendo problemas. Por favor intenta de nuevo."
      : "I'm sorry, I'm having trouble. Please try again.";
  }
}

export async function generateSpeech(text: string, voiceId?: string, authToken?: string, signal?: AbortSignal): Promise<string | null> {
  const selectedVoiceId = voiceId || "DODLEQrClDo8wCz460ld";
  
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      },
      body: JSON.stringify({
        text,
        voiceId: selectedVoiceId
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend TTS API failed with status ${response.status}:`, errorText);
      return null;
    }

    // Return as blob/url handled by the hook usually, 
    // but here we just need to know if it's successful for legacy calls if any.
    // The new hook will call the API directly.
    return "success"; 
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('TTS request aborted');
      return null;
    }
    console.error("Backend TTS Error:", error);
    return null;
  }
}
