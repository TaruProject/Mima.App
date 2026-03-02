import { GoogleGenAI, Modality } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export async function generateChatResponse(
  message: string,
  mode: string
): Promise<string> {
  const ai = getGenAI();
  
  let systemInstruction = "You are Mima, a high-efficiency personal assistant.";
  if (mode === "Business Mode") {
    systemInstruction = "Act as a Lean Management Expert. Identify time waste. Predict logical workflows. Advise on efficiency. Avoid unnecessary chatter.";
  } else if (mode === "Family Mode") {
    systemInstruction = "Act as a Family Organizer. Suggest routines for evenings. Remind about family needs. Generate a sense of achievement. Reduce rush and conflict.";
  } else if (mode === "Zen Mode") {
    systemInstruction = "Act as a Wellness Coach. Prioritize human well-being. Remind about breaks, hydration, and rest. Encourage balance.";
  } else {
    systemInstruction = "Act as a professional, direct, and objective personal assistant. Perform standard assistant tasks without emotional bias.";
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: message,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text || "I'm sorry, I couldn't process that.";
}

export async function generateSpeech(text: string, voiceId?: string): Promise<string | null> {
  const selectedVoiceId = voiceId || "DODLEQrClDo8wCz460ld";
  
  try {
    // Try backend first
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voiceId: selectedVoiceId }),
    });

    // If backend returns HTML (SPA fallback) or fails, it means backend is not running
    const contentType = response.headers.get("content-type");
    if (response.ok && contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (data.audio) return data.audio;
    }
    
    console.warn("Backend TTS failed or not available, falling back to direct API call...");
  } catch (error) {
    console.warn("Backend TTS error, falling back to direct API call...", error);
  }

  // Fallback: Direct call to ElevenLabs from frontend
  try {
    // We try to use VITE_ELEVENLABS_API_KEY if available in the environment
    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.error("VITE_ELEVENLABS_API_KEY is not set for frontend fallback.");
      return null;
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      console.error("Direct ElevenLabs API failed:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to Base64 in the browser
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = window.btoa(binary);
    
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("Direct TTS Error:", error);
    return null;
  }
}
