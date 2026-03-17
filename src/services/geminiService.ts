export async function generateChatResponse(
  message: string,
  mode: string,
  language?: string,
  history?: Array<{ role: string; content: string }>
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
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Chat API error:', errorData);
      return "I'm sorry, I couldn't process that. Please try again.";
    }

    const data = await response.json();
    return data.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    console.error('Chat API Error:', error);
    return "I'm sorry, I couldn't process that. Please try again.";
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
