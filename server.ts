import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import session from "express-session";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = 3000;

const ENCRYPTION_KEY = crypto.scryptSync(process.env.SESSION_SECRET || 'mima-super-secret-key-2026', 'salt', 32);
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

app.use(session({
  secret: process.env.SESSION_SECRET || 'mima-super-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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
    console.log("Generated Auth URL with state fallback:", url);
    res.json({ url });
  } catch (error) {
    console.error('Error generating auth url', error);
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

app.get(["/api/auth/callback/google", "/auth/callback/google"], async (req, res) => {
  const { code, error, state } = req.query;
  let userId = req.session.userId;
  
  console.log("OAuth callback received", { 
    code: code ? "present" : "absent", 
    error, 
    state,
    hasSessionUserId: !!userId 
  });
  
  // Fallback for lost session: extract userId from state
  if (!userId && state && typeof state === 'string' && state.startsWith('google_auth:')) {
    userId = state.split(':')[1];
    console.log("Recovered userId from state fallback:", userId);
    req.session.userId = userId;
  }
  
  try {
    if (error) {
      throw new Error(`Google OAuth error: ${error}`);
    }
    
    if (!code) {
      throw new Error("No authorization code provided");
    }
    
    if (!userId) {
      console.error("Session lost and no fallback userId in state");
      throw new Error("Session expired or invalid. Please try again from the main app.");
    }

    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code as string);
    console.log("Tokens retrieved successfully");
    
    let finalTokens = tokens;

    // Save tokens to Supabase
    if (supabaseUrl && supabaseAnonKey) {
      const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
      
      // If we didn't get a refresh token, try to preserve the existing one
      if (!tokens.refresh_token) {
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
              console.log("Merged existing refresh token with new tokens");
            }
          } catch (e) {
            console.error("Failed to decrypt existing tokens for merge", e);
          }
        }
      }

      req.session.tokens = finalTokens;
      
      // We need to encrypt the tokens before saving
      const encryptedTokens = encrypt(JSON.stringify(finalTokens));
      
      const { error: dbError } = await supabaseAdmin
        .from('user_google_tokens')
        .upsert({ 
          user_id: userId, 
          tokens: encryptedTokens,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        
      if (dbError) {
        console.error("Failed to save tokens to Supabase:", dbError);
      } else {
        console.log("Tokens saved to Supabase successfully");
      }
    } else {
      req.session.tokens = finalTokens;
    }
    
    // Improved HTML with better visibility and explicit error handling
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Mima AI - Authentication Successful</title>
          <style>
            :root {
              --primary: #6221dd;
              --bg: #131117;
              --card: #1a1820;
              --text: #ffffff;
              --text-dim: #a0a0a0;
            }
            body { 
              background: var(--bg); 
              color: var(--text); 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0; 
              overflow: hidden;
            }
            .card { 
              background: var(--card); 
              padding: 2.5rem; 
              border-radius: 1.5rem; 
              text-align: center; 
              border: 1px solid rgba(255,255,255,0.1); 
              box-shadow: 0 20px 50px rgba(0,0,0,0.5);
              max-width: 400px;
              width: 90%;
              animation: slideUp 0.5s ease-out;
            }
            @keyframes slideUp {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            .icon {
              width: 64px;
              height: 64px;
              background: var(--primary);
              border-radius: 1rem;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 1.5rem;
              box-shadow: 0 10px 20px rgba(98, 33, 221, 0.3);
            }
            h2 { margin: 0 0 0.5rem; font-size: 1.5rem; }
            p { color: var(--text-dim); margin: 0 0 2rem; line-height: 1.5; }
            .btn { 
              background: var(--primary); 
              color: white; 
              border: none; 
              padding: 0.8rem 2rem; 
              border-radius: 2rem; 
              cursor: pointer; 
              font-weight: bold; 
              font-size: 1rem;
              transition: all 0.2s;
              width: 100%;
            }
            .btn:hover { transform: scale(1.02); background: #733be6; }
            .loader {
              width: 20px;
              height: 20px;
              border: 2px solid rgba(255,255,255,0.1);
              border-top-color: white;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              display: inline-block;
              vertical-align: middle;
              margin-right: 8px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h2>Connected!</h2>
            <p>Your Google account is now linked to Mima AI. You can close this window.</p>
            <button class="btn" id="finishBtn" onclick="finish()">
              <span id="btnText">Closing in 2s...</span>
            </button>
          </div>
          <script>
            function finish() {
              console.log("Finishing OAuth flow...");
              if (window.opener) {
                try {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  console.log("Message sent to opener");
                } catch (e) {
                  console.error("Failed to postMessage:", e);
                }
                setTimeout(() => { window.close(); }, 100);
              } else {
                window.location.href = '/calendar';
              }
            }
            
            // Auto-finish with countdown
            let seconds = 2;
            const btnText = document.getElementById('btnText');
            
            const timer = setInterval(() => {
              seconds--;
              if (seconds <= 0) {
                clearInterval(timer);
                finish();
              } else {
                btnText.innerText = "Closing in " + seconds + "s...";
              }
            }, 1000);

            // Immediate notification
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { background: #131117; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1a1820; padding: 2rem; border-radius: 1rem; text-align: center; border: 1px solid #333; max-width: 400px; }
            h2 { color: #ef4444; }
            .btn { background: #333; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Error</h2>
            <p>${error instanceof Error ? error.message : 'An unknown error occurred during authentication.'}</p>
            <button class="btn" onclick="window.close()">Close Window</button>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: "${error instanceof Error ? error.message : 'Unknown error'}" }, '*');
            }
          </script>
        </body>
      </html>
    `);
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
