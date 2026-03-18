export async function generateChatResponse(
  message: string,
  mode: string,
  language?: string,
  history?: Array<{ role: string; content: string }>,
  userId?: string
): Promise<string> {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        mode,
        language: language || 'en',
        history: history || [],
        userId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Chat API error:', data);
      // Return the localized error message from backend, or a fallback
      return data.error || "Lo siento, estoy teniendo problemas. Por favor intenta de nuevo.";
    }

    if (!data.text) {
      console.error('Chat API returned empty text');
      return "Lo siento, no pude generar una respuesta. Por favor intenta de nuevo.";
    }

    return data.text;
  } catch (error) {
    console.error('Chat API Error:', error);
    // Return localized error based on language parameter
    const errorMessages: Record<string, string> = {
      en: "I'm sorry, I'm having trouble. Please try again.",
      es: "Lo siento, estoy teniendo problemas. Por favor intenta de nuevo.",
      fi: "Anteeksi, minulla on ongelmia. Yritä uudelleen.",
      sv: "Förlåt, jag har problem. Vänligen försök igen."
    };
    return errorMessages[language || 'es'] || errorMessages.es;
  }
}

export async function generateSpeech(text: string, voiceId?: string, signal?: AbortSignal): Promise<string | null> {
  const selectedVoiceId = voiceId || "DODLEQrClDo8wCz460ld";
  
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    const data = await response.json();
    return data.audio;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('TTS request aborted');
      return null;
    }
    console.error("Backend TTS Error:", error);
    return null;
  }
}
