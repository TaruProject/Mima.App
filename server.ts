import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import session from "express-session";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// In-memory log store for debugging (works in Hostinger without file permissions)
const oauthLogs: string[] = [];
const MAX_LOGS = 100;

function logToFile(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}`;
  
  // Store in memory
  oauthLogs.push(logEntry);
  if (oauthLogs.length > MAX_LOGS) {
    oauthLogs.shift(); // Remove oldest
  }
  
  // Also log to console
  console.log(logEntry);
}

// Validate critical environment variables before starting
const requiredEnvVars = [
  'SESSION_SECRET',
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ELEVENLABS_API_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nServer cannot start. Please check your .env file.');
  process.exit(1);
}

console.log('✅ All critical environment variables loaded successfully');

const app = express();
const PORT = 3000;

const ENCRYPTION_KEY = crypto.scryptSync(process.env.SESSION_SECRET, 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

app.use(express.json());
app.set('trust proxy', 1); // Required for secure cookies behind proxy

// Session configuration optimized for Hostinger
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'mima.session', // Specific cookie name to avoid conflicts
  cookie: {
    secure: true, // Required for HTTPS (Hostinger)
    sameSite: 'lax', // Changed from 'none' to 'lax' for better compatibility
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true // Security: prevent XSS access to cookie
  }
}));

// Log session configuration on startup
console.log('🔧 Session configuration:');
console.log('   - Cookie secure:', true);
console.log('   - Cookie sameSite: lax');
console.log('   - Cookie httpOnly: true');
console.log('   - Trust proxy: enabled');

declare module 'express-session' {
  interface SessionData {
    tokens: any;
    userId?: string;
  }
}

const getOAuth2Client = (req?: express.Request) => {
  // Use the custom domain as the primary one
  const customDomain = "https://me.mima-app.com";
  
  // Use the custom domain if we are on it, otherwise fallback to APP_URL (preview)
  let baseUrl = customDomain;
  
  if (req) {
    const host = req.get('host');
    if (host && !host.includes('mima-app.com')) {
      // If not on custom domain, use APP_URL (preview)
      baseUrl = process.env.APP_URL || `https://${host}`;
    }
  } else if (process.env.NODE_ENV !== 'production') {
    baseUrl = process.env.APP_URL || "http://localhost:3000";
  }

  const redirectUri = `${baseUrl.replace(/\/$/, "")}/api/auth/callback/google`;
  
  console.log(`Using redirectUri: ${redirectUri}`);
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

// API routes FIRST
app.get("/api/health", (req, res) => {
  console.log("Health check requested");
  res.json({ 
    status: "ok", 
    env: {
      hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
      appUrl: process.env.APP_URL,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

app.get("/api/auth/url", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    req.session.userId = user.id;
    
    // CRÍTICO: Guardar sesión ANTES de redirigir a Google
    // Si no se guarda, la sesión se pierde cuando el usuario vuelve del callback
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('CRITICAL: Failed to save session before OAuth:', err);
          logToFile("SESSION SAVE FAILED", { error: err.message, userId: user.id });
          reject(err);
        } else {
          console.log('✅ Session saved with userId:', user.id);
          logToFile("SESSION SAVED", { userId: user.id, sessionID: req.sessionID });
          resolve();
        }
      });
    });

    const oauth2Client = getOAuth2Client(req);
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: `google_auth:${user.id}`
    });
    console.log("🔗 Generated Google Auth URL:", url);
    res.json({ url });
  } catch (error) {
    console.error('❌ Error generating auth url:', error);
    res.status(500).json({ error: "Failed to generate auth url", details: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/debug", (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      APP_URL: process.env.APP_URL,
      hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
      hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY
    },
    headers: req.headers,
    session: !!req.session
  });
});

// OAuth Debug endpoint - check session status
app.get("/api/oauth/debug", (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    sessionID: req.sessionID,
    hasSession: !!req.session,
    sessionUserId: req.session?.userId || null,
    sessionTokens: req.session?.tokens ? 'present' : 'absent',
    cookies: req.headers.cookie,
    userAgent: req.headers['user-agent'],
    message: 'Use this endpoint to verify session persistence'
  });
});

// Read OAuth logs (for debugging)
app.get("/api/oauth/logs", (req, res) => {
  try {
    if (oauthLogs.length === 0) {
      res.setHeader('Content-Type', 'text/plain');
      res.send('No logs yet. Try connecting to Google first.\n\nEndpoint working correctly.');
    } else {
      res.setHeader('Content-Type', 'text/plain');
      res.send(oauthLogs.join('\n'));
    }
  } catch (e) {
    res.status(500).json({ error: 'Cannot read logs', details: e instanceof Error ? e.message : 'Unknown error' });
  }
});

// Helper to get app URL
function getAppUrl(req?: express.Request): string {
  const customDomain = "https://me.mima-app.com";
  if (req) {
    const host = req.get('host');
    if (host && host.includes('mima-app.com')) {
      return customDomain;
    }
    return process.env.APP_URL || `https://${host}` || customDomain;
  }
  return process.env.APP_URL || customDomain;
}

app.get(["/api/auth/callback/google", "/auth/callback/google"], async (req, res) => {
  const { code, error: googleError, state } = req.query;
  let userId = req.session.userId;
  const appUrl = getAppUrl(req);
  
  // Log to both console and file
  const logData = {
    code: code ? "present" : "absent",
    googleError: googleError || null,
    state: state || null,
    sessionID: req.sessionID,
    hasSession: !!req.session,
    sessionUserId: userId || null,
    cookies: req.headers.cookie ? "present" : "absent",
    userAgent: req.headers['user-agent']
  };
  
  logToFile("OAUTH CALLBACK RECEIVED", logData);
  
  console.log("═══════════════════════════════════════════");
  console.log("🔑 OAUTH CALLBACK RECEIVED");
  console.log("═══════════════════════════════════════════");
  console.log("   Code:", code ? "✅ present" : "❌ absent");
  console.log("   Error from Google:", googleError || "none");
  console.log("   State:", state || "none");
  console.log("   Session ID:", req.sessionID);
  console.log("   Has session:", !!req.session);
  console.log("   Session userId:", userId || "❌ NOT SET");
  console.log("   App URL:", appUrl);
  console.log("   Cookies received:", req.headers.cookie ? "✅ yes" : "❌ none");
  
  // Fallback for lost session: extract userId from state
  if (!userId && state && typeof state === 'string' && state.startsWith('google_auth:')) {
    userId = state.split(':')[1];
    console.log("🔄 Recovered userId from state fallback:", userId);
    req.session.userId = userId;
    
    // Save session immediately after recovery
    try {
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log("✅ Session saved after userId recovery");
    } catch (e) {
      console.error("❌ Failed to save session after recovery:", e);
    }
  }
  
  // Helper function to redirect with error
  const redirectWithError = (message: string) => {
    console.error("❌ OAUTH ERROR:", message);
    logToFile("OAUTH ERROR", { message, sessionID: req.sessionID });
    const errorParam = encodeURIComponent(message);
    console.log("   Redirecting to:", `${appUrl}/?error=google_auth_failed`);
    res.redirect(`${appUrl}/?error=google_auth_failed&error_description=${errorParam}`);
  };
  
  // Helper function to redirect with success
  const redirectWithSuccess = () => {
    console.log("✅ OAUTH SUCCESS - Redirecting to app...");
    logToFile("OAUTH SUCCESS", { sessionID: req.sessionID, userId });
    res.redirect(`${appUrl}/?google_connected=true`);
  };
  
  // Validate prerequisites
  if (googleError) {
    return redirectWithError(`Google returned error: ${googleError}`);
  }
  
  if (!code) {
    return redirectWithError("No authorization code provided by Google");
  }
  
  if (!userId) {
    console.error("❌ CRITICAL: No userId in session or state");
    console.error("   This usually means the session cookie was not sent by the browser");
    console.error("   Possible causes:");
    console.error("     - Cookie was blocked (secure/sameSite settings)");
    console.error("     - Session expired");
    console.error("     - Browser blocking third-party cookies");
    return redirectWithError("Session expired or invalid. Please try again.");
  }

  try {
    console.log("🔄 Starting token exchange with Google...");
    
    // Process tokens
    const oauth2Client = getOAuth2Client(req);
    console.log("   OAuth2Client created with redirectUri");
    
    const { tokens } = await oauth2Client.getToken(code as string);
    console.log("✅ Tokens retrieved from Google:");
    console.log("   - Access token:", tokens.access_token ? "✅ present" : "❌ missing");
    console.log("   - Refresh token:", tokens.refresh_token ? "✅ present" : "⚠️  missing (will use existing if available)");
    console.log("   - Expiry date:", tokens.expiry_date);
    
    let finalTokens = tokens;

    // Save tokens to Supabase
    if (supabaseUrl && supabaseAnonKey) {
      console.log("💾 Saving tokens to Supabase...");
      const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
      
      // If we didn't get a refresh token, try to preserve the existing one
      if (!tokens.refresh_token) {
        console.log("   No refresh token, checking for existing token in DB...");
        const { data } = await supabaseAdmin
          .from('user_google_tokens')
          .select('tokens')
          .eq('user_id', userId)
          .single();
          
        if (data && data.tokens) {
          try {
            const existingTokens = JSON.parse(decrypt(data.tokens));
            if (existingTokens.refresh_token) {
              finalTokens = { ...existingTokens, ...tokens };
              console.log("✅ Merged existing refresh token with new tokens");
            }
          } catch (e) {
            console.error("⚠️  Failed to decrypt existing tokens for merge:", e);
          }
        } else {
          console.log("   No existing tokens found in DB");
        }
      }

      // Save to session
      req.session.tokens = finalTokens;
      console.log("   Tokens assigned to session");
      
      // IMPORTANT: Save session before redirect to ensure cookie is written
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("❌ Session save error:", err);
            reject(err);
          } else {
            console.log("✅ Session saved successfully");
            resolve();
          }
        });
      });
      
      // Encrypt and save to database
      console.log("   Encrypting tokens for database...");
      const encryptedTokens = encrypt(JSON.stringify(finalTokens));
      
      console.log("   Upserting to user_google_tokens table...");
      const { error: upsertError } = await supabaseAdmin
        .from('user_google_tokens')
        .upsert({ 
          user_id: userId, 
          tokens: encryptedTokens,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        
      if (upsertError) {
        throw new Error(`Database upsert failed: ${upsertError.message}`);
      }
      
      console.log("✅ Tokens saved to Supabase successfully");
    } else {
      // Save to session only
      console.log("   Supabase not configured, saving to session only");
      req.session.tokens = finalTokens;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    console.log("═══════════════════════════════════════════");
    console.log("✅ OAUTH FLOW COMPLETED SUCCESSFULLY");
    console.log("═══════════════════════════════════════════");
    return redirectWithSuccess();
    
  } catch (err: any) {
    const errorDetails = {
      message: err.message,
      stack: err.stack,
      sessionID: req.sessionID,
      userId: userId || null
    };
    logToFile("OAUTH EXCEPTION", errorDetails);
    console.error("═══════════════════════════════════════════");
    console.error("❌ OAUTH ERROR:");
    console.error("   Message:", err.message);
    console.error("   Stack:", err.stack);
    console.error("═══════════════════════════════════════════");
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during authentication';
    return redirectWithError(errorMessage);
  }
});

app.get("/api/auth/status", async (req, res) => {
  // If we already have tokens in session, we're connected
  if (req.session.tokens) {
    return res.json({ isConnected: true });
  }
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.json({ isConnected: false });
    const token = authHeader.split(' ')[1];
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) return res.json({ isConnected: false });

    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
    const { data, error } = await supabaseAdmin
      .from('user_google_tokens')
      .select('tokens')
      .eq('user_id', user.id)
      .single();
      
    if (error || !data || !data.tokens) {
      return res.json({ isConnected: false });
    }
    
    // Decrypt tokens and save to session
    const decryptedTokens = JSON.parse(decrypt(data.tokens));
    req.session.tokens = decryptedTokens;
    
    return res.json({ isConnected: true });
  } catch (error) {
    console.error("Error checking token status in Supabase:", error);
    return res.json({ isConnected: false });
  }
});

const ttsPreviewCache: Record<string, string> = {};

app.get("/api/tts/preview", async (req, res) => {
  const { voiceId } = req.query;
  if (!voiceId || typeof voiceId !== 'string') {
    return res.status(400).json({ error: "voiceId is required" });
  }

  if (ttsPreviewCache[voiceId]) {
    return res.json({ audio: ttsPreviewCache[voiceId] });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY is not configured" });
  }

  try {
    const text = "Hi, I am Mima. This is how I sound.";
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${base64Audio}`;

    ttsPreviewCache[voiceId] = audioDataUri;
    res.json({ audio: audioDataUri });
  } catch (error) {
    console.error("Preview TTS Error:", error);
    res.status(500).json({ error: "Failed to generate preview audio" });
  }
});

app.post("/api/tts", async (req, res) => {
  const { text, voiceId } = req.body;
  console.log("TTS request received", { textLength: text?.length, voiceId });
  
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error("ELEVENLABS_API_KEY is missing");
    return res.status(500).json({ error: "ELEVENLABS_API_KEY is not configured" });
  }

  try {
    const selectedVoiceId = voiceId || "DODLEQrClDo8wCz460ld"; 
    console.log(`Calling ElevenLabs with voiceId: ${selectedVoiceId}`);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ElevenLabs API error: ${response.status}`, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    
    console.log("TTS generated successfully, sending base64 audio");
    res.json({ audio: `data:audio/mpeg;base64,${base64Audio}` });
  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: "Failed to generate speech", details: error instanceof Error ? error.message : String(error) });
  }
});

// ---- Gemini AI Chat Proxy ----
import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

const languageInstructions: Record<string, string> = {
  fi: 'Vastaa AINA suomeksi. Käytä luontevaa, ystävällistä suomea.',
  sv: 'Svara ALLTID på svenska. Använd naturlig, vänlig svenska.',
  es: 'Responde SIEMPRE en español. Usa un español natural y amigable.',
  en: 'Always respond in English.',
};

app.post("/api/chat", async (req, res) => {
  try {
    const { message, mode, language, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Message is required" });
    }

    const ai = getGenAI();

    let modeInstruction = "Act as a professional, direct, and objective personal assistant. Perform standard assistant tasks without emotional bias.";
    if (mode === "Business Mode") {
      modeInstruction = "Act as a Lean Management Expert. Identify time waste. Predict logical workflows. Advise on efficiency. Avoid unnecessary chatter.";
    } else if (mode === "Family Mode") {
      modeInstruction = "Act as a Family Organizer. Suggest routines for evenings. Remind about family needs. Generate a sense of achievement. Reduce rush and conflict.";
    } else if (mode === "Zen Mode") {
      modeInstruction = "Act as a Wellness Coach. Prioritize human well-being. Remind about breaks, hydration, and rest. Encourage balance.";
    }

    const langCode = language || 'en';
    const langInstruction = languageInstructions[langCode] || languageInstructions.en;
    const systemInstruction = `${modeInstruction} ${langInstruction}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: message,
      config: {
        systemInstruction,
      },
    });

    res.json({ text: response.text || "I'm sorry, I couldn't process that." });
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

async function handleGoogleApiError(error: any, req: any, res: any, serviceName: string) {
  console.error(`Error fetching ${serviceName}`, error);
  if (error.message?.includes('Refresh Token') || error.message?.includes('invalid_grant')) {
    req.session.tokens = undefined;
    
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && supabaseUrl && supabaseAnonKey) {
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
          await supabaseAdmin.from('user_google_tokens').delete().eq('user_id', user.id);
          console.log(`Deleted invalid tokens for user ${user.id}`);
        }
      }
    } catch (e) {
      console.error("Failed to delete invalid tokens from Supabase", e);
    }
    
    return res.status(401).json({ error: "Google authentication expired. Please reconnect." });
  }
  res.status(500).json({ error: `Failed to fetch ${serviceName}` });
}

app.get("/api/calendar/events", async (req, res) => {
  if (!req.session.tokens) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    res.json(response.data.items);
  } catch (error) {
    await handleGoogleApiError(error, req, res, 'calendar');
  }
});

app.get("/api/gmail/messages", async (req, res) => {
  if (!req.session.tokens) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
      q: 'is:unread'
    });
    
    const messages = [];
    if (response.data.messages) {
      for (const msg of response.data.messages) {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id as string,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        });
        
        const headers = msgData.data.payload?.headers;
        const subject = headers?.find(h => h.name === 'Subject')?.value || 'No Subject';
        const fromHeader = headers?.find(h => h.name === 'From')?.value || 'Unknown';
        const date = headers?.find(h => h.name === 'Date')?.value || '';
        
        // Clean up "From" name
        const fromMatch = fromHeader.match(/^(.*?)\s*</);
        const from = fromMatch ? fromMatch[1].replace(/"/g, '') : fromHeader;
        
        messages.push({ id: msg.id, subject, from, date, snippet: msgData.data.snippet });
      }
    }
    
    res.json(messages);
  } catch (error) {
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist", {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Server started successfully');
  });
}

startServer();
