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
  const baseUrl = process.env.APP_URL;
  if (!baseUrl) {
    console.warn("APP_URL environment variable is not set. OAuth redirects may fail.");
  }
  const redirectUri = `${(baseUrl || "http://localhost:3000").replace(/\/$/, "")}/api/auth/callback/google`;
  
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
      state: 'google_auth'
    });
    console.log("Generated Auth URL:", url);
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

app.get("/api/auth/callback/google", async (req, res) => {
  const { code, error } = req.query;
  const userId = req.session.userId;
  console.log("OAuth callback received", { code: code ? "present" : "absent", error, hasUserId: !!userId });
  
  try {
    if (error) {
      throw new Error(`Google OAuth error: ${error}`);
    }
    
    if (!code) {
      throw new Error("No authorization code provided");
    }
    
    if (!userId) {
      throw new Error("Session expired or invalid. Please try again.");
    }

    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code as string);
    console.log("Tokens retrieved successfully");
    req.session.tokens = tokens;

    // Save tokens to Supabase
    if (supabaseUrl && supabaseAnonKey) {
      const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
      
      // We need to encrypt the tokens before saving
      const encryptedTokens = encrypt(JSON.stringify(tokens));
      
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
    }
    
    // Simplified HTML to ensure it works even in restrictive environments
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mima AI - Authentication</title>
          <style>
            body { background: #131117; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1a1820; padding: 2rem; border-radius: 1rem; text-align: center; border: 1px solid #333; }
            .btn { background: #6221dd; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 2rem; cursor: pointer; font-weight: bold; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Connection Successful!</h2>
            <p>You have successfully connected with Google.</p>
            <button class="btn" onclick="finish()">Return to Mima</button>
          </div>
          <script>
            function finish() {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              }
              setTimeout(() => { window.location.href = '/calendar'; }, 500);
            }
            // Auto-finish
            window.onload = () => {
              console.log("Notifying parent...");
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => { window.close(); }, 1500);
              }
            };
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body style="background: #131117; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
          <div style="text-align: center;">
            <h2 style="color: #ef4444;">Authentication Error</h2>
            <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
            <button onclick="window.close()" style="background: #333; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer;">Close</button>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED' }, '*');
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
        model_id: 'eleven_monolingual_v1',
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
    console.error('Error fetching calendar', error);
    res.status(500).json({ error: "Failed to fetch calendar" });
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
    console.error('Error fetching gmail', error);
    res.status(500).json({ error: "Failed to fetch emails" });
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
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Server started successfully');
  });
}

startServer();
