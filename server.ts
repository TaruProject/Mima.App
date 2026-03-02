import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import session from "express-session";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = 3000;

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
  }
}

const getOAuth2Client = () => {
  const redirectUri = "https://me.mima-app.com/api/auth/callback/google";
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

// API routes FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/auth/url", (req, res) => {
  try {
    const oauth2Client = getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
    res.json({ url });
  } catch (error) {
    console.error('Error generating auth url', error);
    res.status(500).json({ error: "Failed to generate auth url" });
  }
});

app.get("/api/auth/callback/google", async (req, res) => {
  const { code, error } = req.query;
  
  try {
    if (error) {
      throw new Error(`Google OAuth error: ${error}`);
    }
    
    if (!code) {
      throw new Error("No authorization code provided");
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session.tokens = tokens;
    
    // Send HTML to close the popup window and notify the parent window
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Conexión Exitosa - Mima AI</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #131117; color: white; margin: 0; }
            .container { text-align: center; padding: 2.5rem; background-color: #1a1820; border-radius: 1.5rem; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); max-width: 90%; width: 400px; }
            .icon { width: 64px; height: 64px; background-color: #10b981; border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 1.5rem; }
            .icon svg { width: 32px; height: 32px; color: white; }
            h2 { margin: 0 0 1rem; font-size: 1.5rem; font-weight: 600; }
            p { margin: 0 0 2rem; color: #94a3b8; line-height: 1.5; }
            .btn { display: inline-block; background-color: #6221dd; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 9999px; font-weight: 500; transition: background-color 0.2s; border: none; cursor: pointer; font-size: 1rem; }
            .btn:hover { background-color: #501bb5; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2>¡Conexión Exitosa!</h2>
            <p>Tu cuenta de Google se ha conectado correctamente con Mima AI. Esta ventana debería cerrarse automáticamente.</p>
            <button class="btn" onclick="closeOrRedirect()">Continuar a la aplicación</button>
          </div>
          <script>
            function closeOrRedirect() {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              }
              // If window didn't close (e.g. mobile browser restrictions), redirect
              setTimeout(() => {
                window.location.href = '/calendar';
              }, 300);
            }

            // Auto-execute on load
            window.onload = () => {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                setTimeout(() => {
                  window.location.href = '/calendar';
                }, 1500);
              }
            };
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    // Send HTML to close the popup window and notify the parent window of failure
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Error de Conexión - Mima AI</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #131117; color: white; margin: 0; }
            .container { text-align: center; padding: 2.5rem; background-color: #1a1820; border-radius: 1.5rem; border: 1px solid rgba(239,68,68,0.3); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); max-width: 90%; width: 400px; }
            .icon { width: 64px; height: 64px; background-color: rgba(239,68,68,0.2); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 1.5rem; }
            .icon svg { width: 32px; height: 32px; color: #ef4444; }
            h2 { margin: 0 0 1rem; font-size: 1.5rem; font-weight: 600; color: #ef4444; }
            p { margin: 0 0 2rem; color: #94a3b8; line-height: 1.5; }
            .btn { display: inline-block; background-color: #334155; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 9999px; font-weight: 500; transition: background-color 0.2s; border: none; cursor: pointer; font-size: 1rem; }
            .btn:hover { background-color: #475569; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </div>
            <h2>Error de Conexión</h2>
            <p>No se pudo conectar tu cuenta de Google. Por favor, inténtalo de nuevo.</p>
            <button class="btn" onclick="closeOrRedirect()">Volver a la aplicación</button>
          </div>
          <script>
            function closeOrRedirect() {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED' }, '*');
                window.close();
              }
              setTimeout(() => {
                window.location.href = '/calendar';
              }, 300);
            }

            window.onload = () => {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED' }, '*');
                setTimeout(() => window.close(), 2000);
              } else {
                setTimeout(() => {
                  window.location.href = '/calendar';
                }, 3000);
              }
            };
          </script>
        </body>
      </html>
    `);
  }
});

app.get("/api/auth/status", (req, res) => {
  res.json({ isConnected: !!req.session.tokens });
});

app.post("/api/tts", async (req, res) => {
  const { text, voiceId } = req.body;
  
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY is not configured" });
  }

  try {
    const selectedVoiceId = voiceId || "DODLEQrClDo8wCz460ld"; 
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
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    
    res.json({ audio: `data:audio/mpeg;base64,${base64Audio}` });
  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: "Failed to generate speech" });
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
  });
}

startServer();
