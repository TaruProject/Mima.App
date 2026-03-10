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
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceId: selectedVoiceId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend TTS API failed with status ${response.status}:`, errorText);
      return null;
    }

    const data = await response.json();
    return data.audio;
  } catch (error) {
    console.error("Backend TTS Error:", error);
    return null;
  }
}
