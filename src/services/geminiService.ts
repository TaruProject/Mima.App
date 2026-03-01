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

export async function generateSpeech(text: string): Promise<string | null> {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("Failed to generate speech via backend");
      return null;
    }

    const data = await response.json();
    return data.audio || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}
