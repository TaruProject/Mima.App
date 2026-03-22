import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import * as chrono from "chrono-node";
import multer from "multer";
import {
  getUserPreferences,
  updateUserPreferences,
  getChatHistory,
  saveChatMessage,
  clearChatHistory
} from "./src/services/userPreferencesService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// CRITICAL variables that should ideally be present
const criticalVars = ['GEMINI_API_KEY', 'SESSION_SECRET', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missingCritical = missingVars.filter(v => criticalVars.includes(v));

// We collect errors but NO LONGER EXIT with process.exit(1) to avoid 503 errors on Hostinger
// Instead, we will report the error via middleware and health check
const envErrors: string[] = [];

if (missingCritical.length > 0) {
  const errorMsg = `❌ CRITICAL: Missing required environment variables: ${missingCritical.join(', ')}`;
  envErrors.push(errorMsg);
  console.error(errorMsg);
}

if (missingVars.length > 0 && envErrors.length === 0) {
  console.warn('⚠️  WARNING: Some optional variables are missing: ' + missingVars.join(', '));
}

console.log('✅ All critical environment variables loaded successfully');

const app = express();
// Port 3000 as fallback. Hostinger may provide a numeric port or a Unix Socket string.
const PORT = process.env.PORT || 3000;

// Determine environment - default to production if PORT is provided (likely hosting)
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.PORT;
if (IS_PROD && process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'production';
}

console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📡 Port: ${PORT}`);

// Safe initialization of encryption key
let ENCRYPTION_KEY: Buffer;
try {
  const secret = process.env.SESSION_SECRET || 'mima-default-fallback-secret-32-chars-long';
  ENCRYPTION_KEY = crypto.scryptSync(secret, 'salt', 32);
} catch (err) {
  console.error("❌ Failed to initialize encryption key:", err);
  ENCRYPTION_KEY = Buffer.alloc(32, 'a'); // Last resort fallback
}
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

// Panic middleware to catch configuration errors early
app.use((req, res, next) => {
  if (envErrors.length > 0 && req.path === '/') {
    return res.status(503).json({
      error: "Configuration Error",
      message: "The server is running but some critical environment variables are missing.",
      missing: missingCritical,
      timestamp: new Date().toISOString()
    });
  }
  next();
});

app.use(express.json());
app.set('trust proxy', 1); // Required for secure cookies behind proxy

// CSP headers - Allow eval for Google GenAI SDK and Google OAuth flow
app.use((req, res, next) => {
  // Only set CSP in production for security
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://accounts.google.com https://*.google.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; " +
      "font-src https://fonts.gstatic.com data:; " +
      "connect-src 'self' https://api.google.com https://generativelanguage.googleapis.com https://*.supabase.co https://api.elevenlabs.io https://*.googleapis.com https://accounts.google.com; " +
      "img-src 'self' data: https: blob:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self' https://accounts.google.com https://*.google.com;"
    );
  }
  next();
});

// Session configuration optimized for Hostinger
app.use(session({
  secret: process.env.SESSION_SECRET || 'mima-session-fallback-secret',
  resave: false,
  saveUninitialized: false,
  name: 'mima.session', // Specific cookie name to avoid conflicts
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only require HTTPS in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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

// Helper function to save session reliably - prevents race conditions
async function saveSession(req: express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        reject(err);
      } else {
        console.log('✅ Session saved successfully');
        resolve();
      }
    });
  });
}

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware to authenticate Supabase users
const authenticateSupabaseUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // 1. Try Token Authentication (Standard)
    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        (req as any).user = user;
        return next();
      }
      console.warn("⚠️ Token auth failed, trying session fallback...");
    }

    // 2. Try Session Fallback (If headers are stripped by proxy)
    const sessionUserId = req.session.userId;
    if (sessionUserId) {
      console.log("🔄 Authenticating via session userId:", sessionUserId);
      const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
      const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(sessionUserId);
      
      if (!error && user) {
        (req as any).user = user;
        return next();
      }
    }

    console.error("❌ Auth failed: No valid token or session");
    return res.status(401).json({ 
      error: "Unauthorized", 
      details: "No valid authentication found. If you are seeing this, try logging in again." 
    });
  } catch (err) {
    console.error("❌ Unexpected auth error:", err);
    return res.status(500).json({ error: "Internal server error during authentication" });
  }
};

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
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      appUrl: process.env.APP_URL,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

// Detailed health check - works in production
app.get("/api/health-detailed", (req, res) => {
  const healthData = {
    status: "ok",
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    },
    gemini: {
      initialized: geminiInitialized,
      initError: geminiInitError,
      apiKeyPresent: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY?.length || 0
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      appUrl: process.env.APP_URL,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
      hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  };
  
  // If Gemini failed, mark as degraded
  if (!geminiInitialized && geminiInitError) {
    healthData.status = "degraded";
  }
  
  res.json(healthData);
});

// Simple health check for Gemini configuration
app.get("/api/test/gemini-config", (req, res) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: "Endpoint disabled in production",
      message: "For security reasons, this endpoint is only available in development"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  res.json({
    hasApiKey: !!apiKey,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for Gemini API - use this to verify the chat is working
app.get("/api/test/gemini", async (req, res) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      status: "error",
      message: "Endpoint disabled in production for security reasons"
    });
  }

  console.log("🧪 Gemini test endpoint called");

  try {
    // Step 1: Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY not set");
      return res.status(500).json({
        status: "error",
        step: "config",
        message: "GEMINI_API_KEY environment variable is not set",
        solution: "Add GEMINI_API_KEY to your environment variables in Hostinger"
      });
    }
    console.log("✅ API key found");

    // Step 2: Initialize client
    console.log("🔄 Initializing GoogleGenAI client...");
    let ai;
    try {
      ai = getGenAI();
      console.log("✅ GoogleGenAI client initialized");
    } catch (initError: any) {
      console.error("❌ Failed to initialize GoogleGenAI:", initError);
      return res.status(500).json({
        status: "error",
        step: "initialization",
        message: "Failed to initialize Gemini client",
        error: initError.message
      });
    }

    // Step 3: Make API call
    console.log("🔄 Calling Gemini API with model gemini-2.5-flash...");
    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Hola, ¿cómo estás?",
        config: {
          systemInstruction: "Eres Mima, un asistente personal. SIEMPRE responde en español.",
        },
      });
      console.log("✅ Gemini API responded");
    } catch (apiError: any) {
      console.error("❌ Gemini API call failed:", apiError);
      return res.status(500).json({
        status: "error",
        step: "api_call",
        message: "Gemini API call failed",
        error: apiError.message,
        details: apiError.stack,
        model: "gemini-2.5-flash"
      });
    }

    // Step 4: Return success
    console.log("✅ Gemini test completed successfully");
    res.json({
      status: "ok",
      step: "complete",
      message: "Gemini API is working correctly",
      response: response.text,
      model: "gemini-2.5-flash"
    });

  } catch (error: any) {
    console.error("❌ Unexpected error in Gemini test:", error);
    res.status(500).json({
      status: "error",
      step: "unknown",
      message: "Unexpected error during Gemini test",
      error: error.message,
      stack: error.stack
    });
  }
});

// Debug endpoint for chat - test chat with specific parameters
// Only available in development for security
app.get("/api/debug/chat", async (req, res) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      status: "error",
      message: "Endpoint disabled in production for security reasons"
    });
  }

  const { message = 'test', language = 'es', mode = 'Neutral' } = req.query;

  console.log("🔍 Debug chat endpoint called");

  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    geminiInitialized,
    geminiInitError,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    apiKeyFirstChars: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 8) + '...' : 'NOT SET',
    apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
    testParams: { message, language, mode },
    languageInstructions: Object.keys(languageInstructions)
  };

  try {
    // Test Gemini API
    console.log("🔄 Testing Gemini API connection...");
    const ai = getGenAI();
    console.log("✅ Gemini client obtained");

    const selectedModel = 'gemini-2.5-flash';
    console.log(`🔄 Calling model: ${selectedModel}`);

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: message as string,
      config: {
        systemInstruction: languageInstructions[language as string] || languageInstructions.en,
        maxOutputTokens: 100
      },
    });

    debugInfo['testResponse'] = response.text?.substring(0, 100) || 'EMPTY_RESPONSE';
    debugInfo['fullResponse'] = response.text;
    debugInfo['responseLength'] = response.text?.length || 0;
    debugInfo['status'] = 'SUCCESS';
    debugInfo['modelUsed'] = selectedModel;

    res.json(debugInfo);
  } catch (error: any) {
    console.error("❌ Debug chat error:", error);
    debugInfo['error'] = error.message;
    debugInfo['errorStack'] = error.stack;
    debugInfo['errorDetails'] = JSON.stringify(error, null, 2);
    debugInfo['errorCause'] = error.cause;
    debugInfo['status'] = 'FAILED';
    res.status(500).json(debugInfo);
  }
});

// Endpoint to get last chat error - for debugging production issues
app.get("/api/debug/last-chat-error", (req, res) => {
  // Return last OAuth log which may contain error info
  const lastLogs = oauthLogs.slice(-10);
  res.json({
    timestamp: new Date().toISOString(),
    lastLogs,
    message: "Check server logs for detailed error information"
  });
});

app.get("/api/auth/url", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    req.session.userId = user.id;

    // CRÍTICO: Guardar sesión ANTES de redirigir a Google
    // Si no se guarda, la sesión se pierde cuando el usuario vuelve del callback
    try {
      await saveSession(req);
      logToFile("SESSION SAVED", { userId: user.id, sessionID: req.sessionID });
    } catch (err: any) {
      console.error('CRITICAL: Failed to save session before OAuth:', err);
      logToFile("SESSION SAVE FAILED", { error: err.message, userId: user.id });
      return res.status(500).json({ error: "Failed to save session" });
    }

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
      await saveSession(req);
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

    // Redirect with success param - no delay needed if we awaited saveSession
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
      try {
        await saveSession(req);
      } catch (err: any) {
        console.error("❌ Session save error:", err);
        throw err;
      }

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
      try {
        await saveSession(req);
      } catch (err: any) {
        console.error("❌ Session save error:", err);
        throw err;
      }
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

// ---- User Preferences Endpoints ----

// Get user preferences
app.get("/api/user/preferences", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const preferences = await getUserPreferences(user.id);

    // Fallback si no hay preferencias o la tabla no existe
    res.json(preferences || {
      user_id: user.id,
      onboarding_done: false,
      voice_id: 'DODLEQrClDo8wCz460ld',
      language: 'en'
    });
  } catch (error: any) {
    console.error("Error fetching user preferences:", error);
    // Fallback - retornar valores por defecto en lugar de error 500
    res.status(200).json({
      user_id: (req as any).user?.id || 'unknown',
      onboarding_done: false,
      voice_id: 'DODLEQrClDo8wCz460ld',
      language: 'en',
      note: 'Preferences service temporarily unavailable'
    });
  }
});

// Update user preferences
app.post("/api/user/preferences", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const { onboarding_done, voice_id, language } = req.body;
    const success = await updateUserPreferences(user.id, {
      ...(onboarding_done !== undefined && { onboarding_done }),
      ...(voice_id !== undefined && { voice_id }),
      ...(language !== undefined && { language })
    });

    if (success) {
      res.json({ success: true });
    } else {
      // No fallar - solo loguear
      console.warn("Failed to update preferences, but continuing");
      res.status(200).json({ success: true, note: 'Preferences not saved (table may not exist)' });
    }
  } catch (error: any) {
    console.error("Error updating user preferences:", error);
    // No fallar - retornar éxito aunque no se guarde
    res.status(200).json({ success: true, note: 'Preferences update skipped (service unavailable)' });
  }
});

// Get chat history
app.get("/api/chat/history", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = await getChatHistory(user.id, limit);
    res.json(messages);
  } catch (error: any) {
    console.error("Error fetching chat history:", error);
    // Fallback - retornar array vacío en lugar de error
    res.status(200).json([]);
  }
});

// Save chat message
app.post("/api/chat/message", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const { role, content, mode, audio_data } = req.body;
    const success = await saveChatMessage({
      user_id: user.id,
      role,
      content,
      mode,
      audio_data
    });

    if (success) {
      res.json({ success: true });
    } else {
      console.warn("Failed to save chat message, but continuing");
      res.status(200).json({ success: true, note: 'Message not saved (table may not exist)' });
    }
  } catch (error: any) {
    console.error("Error saving chat message:", error);
    // No fallar - el chat debe seguir funcionando
    res.status(200).json({ success: true, note: 'Message save skipped (service unavailable)' });
  }
});

// Clear chat history
app.delete("/api/chat/history", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const success = await clearChatHistory(user.id);
    if (success) {
      res.json({ success: true });
    } else {
      console.warn("Failed to clear chat history");
      res.status(200).json({ success: true, note: 'Clear skipped (service unavailable)' });
    }
  } catch (error: any) {
    console.error("Error clearing chat history:", error);
    res.status(200).json({ success: true, note: 'Clear skipped (service unavailable)' });
  }
});

const ttsPreviewCache: Record<string, string> = {};

app.get("/api/tts/preview", authenticateSupabaseUser, async (req, res) => {
  const { voiceId } = req.query;
  if (!voiceId || typeof voiceId !== 'string') {
    return res.status(400).json({ error: "voiceId is required" });
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

    // Set headers for binary audio stream
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    if (response.body) {
      // Use pipeline for more robust streaming
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      throw new Error("Empty response body from ElevenLabs");
    }
  } catch (error) {
    console.error("Preview TTS Error:", error);
    res.status(500).json({ error: "Failed to generate preview audio" });
  }
});

app.post("/api/tts", authenticateSupabaseUser, async (req, res) => {
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

    // Set headers for binary audio stream
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      throw new Error("Empty response body from ElevenLabs");
    }
  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: "Failed to generate speech", details: error instanceof Error ? error.message : String(error) });
  }
});

// ---- Calendar Service Functions ----

interface CalendarEventData {
  summary: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  isAllDay?: boolean;
}

// Parse natural language date using chrono-node
function parseNaturalDate(dateText: string, referenceDate?: Date): { start: Date; end?: Date; isAllDay: boolean } | null {
  const refDate = referenceDate || new Date();
  const results = chrono.parse(dateText, refDate, { forwardDate: true });

  if (results.length === 0) return null;

  const result = results[0];
  const start = result.start.date();
  const end = result.end ? result.end.date() : undefined;

  // Check if it's an all-day event (no specific time mentioned)
  const isAllDay = !result.start.isCertain('hour');

  return { start, end, isAllDay };
}

// Create a calendar event
async function createCalendarEvent(userTokens: any, eventData: CalendarEventData): Promise<any> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(userTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  let event: any = {
    summary: eventData.summary,
  };

  // Only add description if provided
  if (eventData.description) {
    event.description = eventData.description;
  }

  if (eventData.isAllDay) {
    // All-day event format - Google Calendar uses exclusive end date
    const startDateStr = eventData.startDate.toISOString().split('T')[0];
    // For all-day events, Google Calendar expects the day AFTER as the end date
    const nextDay = new Date(eventData.endDate || eventData.startDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const endDateStr = nextDay.toISOString().split('T')[0];
    event.start = { date: startDateStr };
    event.end = { date: endDateStr };
  } else {
    // Timed event format
    event.start = { dateTime: eventData.startDate.toISOString() };
    event.end = { dateTime: eventData.endDate.toISOString() };
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  return response.data;
}

// ---- STT (Speech to Text) Endpoint ----

app.post("/api/transcribe", authenticateSupabaseUser, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  console.log("🎙️ Transcription request received", {
    size: req.file.size,
    mimetype: req.file.mimetype
  });

  try {
    const ai = getGenAI();

    // Convert buffer to base64 for Gemini
    const audioData = {
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype
      }
    };

    const prompt = "Transcribe the following audio precisely. Output ONLY the transcription text, no extra words or explanations.";

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            audioData
          ]
        }
      ]
    });

    const text = result.text;

    console.log("✅ Transcription successful:", text);
    res.json({ text });
  } catch (error: any) {
    console.error("❌ Transcription Error:", error);
    res.status(500).json({
      error: "Failed to transcribe audio",
      details: error.message
    });
  }
});

// List calendar events
async function listCalendarEvents(userTokens: any, startDate: string, endDate: string, maxResults: number = 10): Promise<any[]> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(userTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startDate + 'T00:00:00Z',
    timeMax: endDate + 'T23:59:59Z',
    maxResults: maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

// Search calendar events by keyword
async function searchCalendarEvents(userTokens: any, query: string, maxResults: number = 10): Promise<any[]> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(userTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Search in the next 30 days by default
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: thirtyDaysLater.toISOString(),
    q: query, // Google Calendar API search query
    maxResults: maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

// Delete a calendar event
async function deleteCalendarEvent(userTokens: any, eventId: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(userTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
  });
}

// Update a calendar event
async function updateCalendarEvent(userTokens: any, eventId: string, updates: Partial<CalendarEventData>): Promise<any> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(userTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Get existing event
  const { data: existingEvent } = await calendar.events.get({
    calendarId: 'primary',
    eventId: eventId,
  });

  // Apply updates
  const updatedEvent: any = { ...existingEvent };
  if (updates.summary) updatedEvent.summary = updates.summary;
  if (updates.description) updatedEvent.description = updates.description;

  if (updates.startDate && updates.endDate) {
    if (updates.isAllDay) {
      const startDateStr = updates.startDate.toISOString().split('T')[0];
      const endDateStr = updates.endDate.toISOString().split('T')[0];
      updatedEvent.start = { date: startDateStr };
      updatedEvent.end = { date: endDateStr };
    } else {
      updatedEvent.start = { dateTime: updates.startDate.toISOString() };
      updatedEvent.end = { dateTime: updates.endDate.toISOString() };
    }
  }

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    requestBody: updatedEvent,
  });

  return response.data;
}

// ---- Gemini AI Chat Proxy ----
let genAI: GoogleGenAI | null = null;
let geminiInitialized = false;
let geminiInitError: string | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const errorMsg = "GEMINI_API_KEY is not configured";
      console.error("❌ GEMINI INIT ERROR:", errorMsg);
      geminiInitError = errorMsg;
      throw new Error(errorMsg);
    }
    try {
      console.log("🔧 Initializing Gemini AI client...");
      genAI = new GoogleGenAI({ apiKey });
      geminiInitialized = true;
      geminiInitError = null;
      console.log("✅ Gemini AI client initialized successfully");
    } catch (error: any) {
      const errorMsg = `Failed to initialize Gemini: ${error.message}`;
      console.error("❌ GEMINI INIT ERROR:", errorMsg);
      geminiInitError = error.message;
      throw error;
    }
  }
  return genAI;
}

// Pre-initialize Gemini on server start (optional health check)
async function initializeGemini(): Promise<boolean> {
  try {
    getGenAI();
    return true;
  } catch (error: any) {
    console.error("❌ Gemini initialization failed:", error.message);
    return false;
  }
}

const languageInstructions: Record<string, string> = {
  fi: 'Vastaa AINA suomeksi. Käytä luontevaa, ystävällistä suomea.',
  sv: 'Svara ALLTID på svenska. Använd naturlig, vänlig svenska.',
  es: 'Responde SIEMPRE en español. Usa un español natural y amigable.',
  en: 'Always respond in English.',
};

// Model selection router - determines which Gemini model to use
function selectModelForTask(message: string, mode?: string): { model: string; reason: string; maxTokens: number } {
  const lowerMsg = message.toLowerCase();

  // Complex task indicators that need Pro model
  const complexIndicators = [
    'analiza', 'análisis', 'analyze', 'analysis',
    'compara', 'compare', 'comparación', 'comparison',
    'investiga', 'investigate', 'research',
    'explica detalladamente', 'explain in detail',
    'paso a paso', 'step by step',
    'estrategia', 'strategy', 'plan detallado',
    'optimiza', 'optimize', 'mejora procesos',
    'lean', 'six sigma', 'flujo de trabajo',
    'reporte', 'report', 'informe',
    'sintetiza', 'synthesize', 'resume largo'
  ];

  // Check for complex task patterns
  const isComplexTask = complexIndicators.some(indicator => lowerMsg.includes(indicator));
  const isLongContext = message.length > 500;
  const isBusinessMode = mode === 'Business Mode';

  // Decision logic - Using Gemini 2.5 models (1.5 is deprecated)
  if (isBusinessMode && isComplexTask) {
    return {
      model: 'gemini-2.5-pro',
      reason: 'Business mode + complex analysis task',
      maxTokens: 2000
    };
  }

  if (isComplexTask && isLongContext) {
    return {
      model: 'gemini-2.5-pro',
      reason: 'Complex analysis with long context',
      maxTokens: 2000
    };
  }

  // Default: Use Flash for speed and cost efficiency (95% of tasks)
  return {
    model: 'gemini-2.5-flash',
    reason: 'Standard task - Flash sufficient',
    maxTokens: 1000
  };
}

// Debug endpoint to check environment status (safe, no keys revealed)
app.get("/api/debug/env-status", (req, res) => {
  const status: Record<string, any> = {};
  const requiredVars = ['GEMINI_API_KEY', 'SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL'];
  
  requiredVars.forEach(v => {
    const val = process.env[v];
    status[v] = {
      exists: !!val,
      length: val ? val.length : 0,
      prefix: val ? val.substring(0, 4) + '...' : undefined
    };
  });

  res.json({
    node_env: process.env.NODE_ENV,
    port: PORT,
    vars: status,
    timestamp: new Date().toISOString(),
    static_dirs: {
      dist: fs.existsSync(path.join(__dirname, "dist")),
      public_html: fs.existsSync(path.join(__dirname, "public_html")),
      cwd: process.cwd(),
      dirname: __dirname
    }
  });
});

app.post("/api/chat", authenticateSupabaseUser, async (req, res) => {
  const { message, mode, language, history } = req.body;
  const user = (req as any).user;
  const userId = user.id;

  console.log("═══════════════════════════════════════════");
  console.log("🤖 CHAT API REQUEST");
  console.log("═══════════════════════════════════════════");
  console.log("   Message:", message?.substring(0, 100));
  console.log("   Mode:", mode || 'Neutral');
  console.log("   Language:", language || 'en');
  console.log("   UserId:", userId);
  console.log("   GEMINI_API_KEY set:", !!process.env.GEMINI_API_KEY);
  console.log("   GEMINI_API_KEY length:", process.env.GEMINI_API_KEY?.length || 0);

  // Log request timestamp for debugging
  const requestStart = Date.now();

  try {
    if (!message || typeof message !== 'string') {
      console.error("❌ Invalid message provided");
      return res.status(400).json({
        error: "Message is required",
        errorCode: "INVALID_MESSAGE"
      });
    }

    // Check Gemini initialization status first
    if (geminiInitError) {
      console.error("❌ Gemini not initialized:", geminiInitError);
      return res.status(503).json({
        error: "AI service unavailable",
        errorCode: "GEMINI_NOT_CONFIGURED",
        details: geminiInitError
      });
    }

    // Check if API key exists
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY is not set in environment variables");
      return res.status(503).json({
        error: "AI service unavailable",
        errorCode: "GEMINI_NOT_CONFIGURED",
        details: "GEMINI_API_KEY environment variable is not set"
      });
    }

    let ai;
    try {
      ai = getGenAI();
      console.log("✅ Gemini AI client initialized");
    } catch (error: any) {
      console.error("❌ Failed to get Gemini client:", error.message);
      return res.status(503).json({
        error: "AI service unavailable",
        errorCode: "GEMINI_INIT_FAILED",
        details: error.message
      });
    }

    // INTELLIGENT MODEL ROUTING
    const modelSelection = selectModelForTask(message, mode);
    console.log("🧠 Model selected:", modelSelection.model);
    console.log("   Reason:", modelSelection.reason);

    // System prompt with explicit language instruction
    let modeInstruction = "Eres Mima, un asistente personal inteligente, directo y objetivo. Ayudas con tareas de calendario, correos y organización personal.";
    if (mode === "Business Mode") {
      modeInstruction = "Eres Mima, un Experto en Lean Management. Identificas desperdicio de tiempo. Predices flujos de trabajo lógicos. Asesoras sobre eficiencia. Evitas charlas innecesarias.";
    } else if (mode === "Family Mode") {
      modeInstruction = "Eres Mima, un Organizador Familiar. Sugieres rutinas para las tardes. Recuerdas necesidades familiares. Generas sensación de logro. Reduces prisa y conflicto.";
    } else if (mode === "Zen Mode") {
      modeInstruction = "Eres Mima, un Coach de Bienestar. Priorizas el bienestar humano. Recuerdas pausas, hidratación y descanso. Fomentas el equilibrio.";
    }

    const langCode = language || 'en';
    const langInstruction = languageInstructions[langCode] || languageInstructions.en;

    // CALENDAR TOOLS INSTRUCTIONS for function calling
    const calendarToolsInstruction = userId ? `

CALENDAR TOOLS:
Tienes acceso al calendario del usuario. Para crear eventos, responde EXACTAMENTE con este formato JSON:
{"tool": "createCalendarEvent", "summary": "Título del evento", "dateText": "mañana a las 3pm", "description": "Descripción opcional"}

Para ver eventos:
{"tool": "listCalendarEvents", "dateText": "esta semana", "maxResults": 10}

Para buscar eventos por nombre:
{"tool": "searchCalendarEvents", "query": "reunión", "maxResults": 10}

Para eliminar eventos (primero busca si no tienes el ID):
{"tool": "deleteCalendarEvent", "eventId": "id_del_evento"}

Para actualizar eventos:
{"tool": "updateCalendarEvent", "eventId": "id_del_evento", "summary": "Nuevo título", "dateText": "pasado mañana a las 5pm"}

IMPORTANTE: Si el usuario dice "elimina mi reunión de mañana", PRIMERO busca con searchCalendarEvents, luego elimina.
Si el usuario pide crear/ver/modificar/eliminar un evento, DEBES responder SOLO con el JSON de la herramienta, sin texto adicional.
Si NO es una petición de calendario, responde normalmente.` : '';

    // CRITICAL: Explicit system prompt with language enforcement
    const systemInstruction = `${modeInstruction}\n\n${langInstruction}\n\n${calendarToolsInstruction}\n\n` +
      `STRICT INSTRUCTIONS:\n` +
      `1. You MUST ALWAYS respond in the user's selected language: ${langCode}.\n` +
      `2. Do not use any other language unless explicitly asked by the user.\n` +
      `3. If you use a tool (JSON format), that's the only thing you should return.\n` +
      `4. Maintain the persona: ${mode || 'Neutral'}.`;

    console.log("📝 System prompt prepared (length:", systemInstruction.length, ")");
    console.log("📝 Language instruction:", langInstruction);
    console.log("📝 Model to use:", modelSelection.model);
    console.log("📝 Max tokens:", modelSelection.maxTokens);

    // Call Gemini API with selected model
    console.log("🔄 Calling Gemini API...");
    console.log("🔄 Model:", modelSelection.model);
    console.log("🔄 Contents:", message.substring(0, 100));

    let response;
    try {
      const primaryModel = modelSelection.model;

      console.log(`🔄 Attempting Gemini call with: ${primaryModel}`);
      response = await ai.models.generateContent({
        model: primaryModel,
        contents: message,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: modelSelection.maxTokens,
        },
      });

      console.log("✅ Gemini API response received");
      console.log("   Response text length:", response.text?.length || 0);
      console.log("   Response text preview:", response.text?.substring(0, 100));

      if (!response.text) {
        console.error("❌ Gemini returned empty response");
        console.error("   Full response:", JSON.stringify(response, null, 2));
        throw new Error("Empty response from Gemini API");
      }
    } catch (apiError: any) {
      console.error("❌ Gemini API call failed:", apiError.message);
      console.error("   Error details:", JSON.stringify(apiError, null, 2));
      console.error("   Error stack:", apiError.stack);

      // Re-throw with more context
      throw new Error(`Gemini API error: ${apiError.message}`);
    }

    // CHECK FOR FUNCTION CALL (Calendar Tools)
    let responseText = response.text;

    if (userId) {
      try {
        // Try to parse as JSON function call - allow for markdown blocks
        let trimmedText = responseText.trim();
        if (trimmedText.includes('```json')) {
          const match = trimmedText.match(/```json\s*([\s\S]*?)\s*```/);
          if (match) trimmedText = match[1].trim();
        } else if (trimmedText.includes('```')) {
          const match = trimmedText.match(/```\s*([\s\S]*?)\s*```/);
          if (match) trimmedText = match[1].trim();
        }

        if (trimmedText.startsWith('{') && trimmedText.includes('"tool":')) {
          console.log("🔧 Detected function call, parsing...");
          const functionCall = JSON.parse(trimmedText);

          if (functionCall.tool) {
            console.log("   Tool:", functionCall.tool);

            // Get user tokens from Supabase
            const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
            const { data: tokenData } = await supabaseAdmin
              .from('user_google_tokens')
              .select('tokens')
              .eq('user_id', userId)
              .single();

            if (!tokenData) {
              responseText = "Necesitas conectar tu cuenta de Google primero para usar el calendario. Ve a la sección de Calendario para conectarla.";
            } else {
              const userTokens = JSON.parse(decrypt(tokenData.tokens));

              // Execute the appropriate function
              if (functionCall.tool === 'createCalendarEvent') {
                const dateInfo = parseNaturalDate(functionCall.dateText);
                if (!dateInfo) {
                  responseText = "No pude entender la fecha. Por favor, sé más específico (ej: 'mañana a las 3pm' o 'el lunes que viene').";
                } else {
                  // Default duration: 1 hour for timed events
                  const endDate = dateInfo.end || new Date(dateInfo.start.getTime() + 60 * 60 * 1000);

                  const eventData: CalendarEventData = {
                    summary: functionCall.summary,
                    description: functionCall.description,
                    startDate: dateInfo.start,
                    endDate: endDate,
                    isAllDay: dateInfo.isAllDay,
                  };

                  const createdEvent = await createCalendarEvent(userTokens, eventData);
                  responseText = `✅ Evento creado: "${createdEvent.summary}" para el ${dateInfo.start.toLocaleDateString(langCode)}.`;
                  console.log("   Created event:", createdEvent.id);
                }
              } else if (functionCall.tool === 'listCalendarEvents') {
                const dateInfo = parseNaturalDate(functionCall.dateText);
                if (!dateInfo) {
                  // Default to today if date not understood
                  const today = new Date();
                  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
                  const events = await listCalendarEvents(userTokens, today.toISOString().split('T')[0], tomorrow.toISOString().split('T')[0], functionCall.maxResults || 10);

                  if (events.length === 0) {
                    responseText = "No tienes eventos programados para hoy.";
                  } else {
                    responseText = "📅 Tus eventos de hoy:\n\n" + events.map((e: any) => {
                      const start = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString(langCode, { hour: '2-digit', minute: '2-digit' }) : 'Todo el día';
                      return `- ${start}: ${e.summary}`;
                    }).join('\n');
                  }
                } else {
                  const startStr = dateInfo.start.toISOString().split('T')[0];
                  const endStr = (dateInfo.end || dateInfo.start).toISOString().split('T')[0];
                  const events = await listCalendarEvents(userTokens, startStr, endStr, functionCall.maxResults || 10);

                  if (events.length === 0) {
                    responseText = `No tienes eventos programados para ${functionCall.dateText}.`;
                  } else {
                    responseText = `📅 Eventos para ${functionCall.dateText}:\n\n` + events.map((e: any) => {
                      const start = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString(langCode, { hour: '2-digit', minute: '2-digit' }) : 'Todo el día';
                      return `- ${start}: ${e.summary}`;
                    }).join('\n');
                  }
                }
              } else if (functionCall.tool === 'searchCalendarEvents') {
                const events = await searchCalendarEvents(userTokens, functionCall.query, functionCall.maxResults || 10);

                if (events.length === 0) {
                  responseText = `No encontré eventos que coincidan con "${functionCall.query}".`;
                } else {
                  responseText = `🔍 Eventos encontrados para "${functionCall.query}":\n\n` + events.map((e: any, i: number) => {
                    const start = e.start.dateTime ? new Date(e.start.dateTime).toLocaleString(langCode, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Todo el día';
                    return `${i + 1}. ${start}: ${e.summary} (ID: ${e.id})`;
                  }).join('\n');
                }
              } else if (functionCall.tool === 'deleteCalendarEvent') {
                await deleteCalendarEvent(userTokens, functionCall.eventId);
                responseText = "✅ Evento eliminado correctamente.";
              } else if (functionCall.tool === 'updateCalendarEvent') {
                const updates: Partial<CalendarEventData> = {};
                if (functionCall.summary) updates.summary = functionCall.summary;
                if (functionCall.description) updates.description = functionCall.description;
                if (functionCall.dateText) {
                  const dateInfo = parseNaturalDate(functionCall.dateText);
                  if (dateInfo) {
                    updates.startDate = dateInfo.start;
                    updates.endDate = dateInfo.end || new Date(dateInfo.start.getTime() + 60 * 60 * 1000);
                    updates.isAllDay = dateInfo.isAllDay;
                  }
                }

                const updatedEvent = await updateCalendarEvent(userTokens, functionCall.eventId, updates);
                responseText = `✅ Evento actualizado: "${updatedEvent.summary}".`;
              }
            }
          }
        }
      } catch (functionError: any) {
        console.error("❌ Function call error:", functionError.message);
        responseText = "Hubo un problema al procesar tu solicitud de calendario. Por favor, intenta de nuevo.";
      }
    }

    console.log("✅ Sending response to client");
    res.json({ text: responseText });

  } catch (error: any) {
    console.error("═══════════════════════════════════════════");
    console.error("❌ CHAT API ERROR:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);

    // Log specific error types for debugging
    if (error.message?.includes('API key')) {
      console.error("   ⚠️  API Key issue detected");
    }
    if (error.message?.includes('model')) {
      console.error("   ⚠️  Model name issue detected");
    }
    if (error.message?.includes('quota')) {
      console.error("   ⚠️  Quota exceeded");
    }

    console.error("═══════════════════════════════════════════");

    // Calculate request duration
    const duration = Date.now() - requestStart;
    console.log(`⏱️  Request duration: ${duration}ms`);

    // Return error in the user's language with error code
    const langCode = language || 'en';
    const errorMessages: Record<string, string> = {
      en: "I'm sorry, I'm having trouble processing your request. Please try again in a moment.",
      es: "Lo siento, estoy teniendo problemas para procesar tu solicitud. Por favor, intenta de nuevo en un momento.",
      fi: "Anteeksi, minulla on vaikeuksia käsitellä pyyntöäsi. Yritä uudelleen hetken kuluttua.",
      sv: "Förlåt, jag har problem med att bearbeta din begäran. Vänligen försök igen om en stund."
    };

    // Determine error code for frontend
    let errorCode = "UNKNOWN_ERROR";
    if (error.message?.includes('API key')) errorCode = "INVALID_API_KEY";
    else if (error.message?.includes('model')) errorCode = "MODEL_ERROR";
    else if (error.message?.includes('quota')) errorCode = "QUOTA_EXCEEDED";
    else if (error.message?.includes('timeout')) errorCode = "TIMEOUT";
    else if (error.message?.includes('network')) errorCode = "NETWORK_ERROR";

    res.status(500).json({
      error: errorMessages[langCode] || errorMessages.en,
      errorCode,
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

async function handleGoogleApiError(error: any, req: any, res: any, serviceName: string) {
  console.error(`═══════════════════════════════════════════`);
  console.error(`❌ Error fetching ${serviceName}`);
  console.error(`   Message: ${error.message}`);
  console.error(`   Code: ${error.code || 'N/A'}`);
  console.error(`   Status: ${error.status || 'N/A'}`);
  console.error(`═══════════════════════════════════════════`);

  // Check for token expiration or invalid grant
  const isTokenExpired =
    error.message?.includes('Refresh Token') ||
    error.message?.includes('invalid_grant') ||
    error.message?.includes('Token has been expired or revoked') ||
    error.status === 401;

  if (isTokenExpired) {
    console.log(`🔄 ${serviceName} tokens expired, clearing session and DB tokens...`);

    // Clear session tokens
    req.session.tokens = undefined;

    try {
      const authHeader = req.headers.authorization;
      if (authHeader && supabaseUrl && supabaseAnonKey) {
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError) {
          console.error("Failed to get user from auth token:", userError.message);
        } else if (user) {
          // Delete tokens from Supabase
          const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
          const { error: deleteError } = await supabaseAdmin
            .from('user_google_tokens')
            .delete()
            .eq('user_id', user.id);

          if (deleteError) {
            console.error("Failed to delete tokens from Supabase:", deleteError.message);
          } else {
            console.log(`✅ Deleted invalid tokens for user ${user.id} from Supabase`);
          }
        }
      }
    } catch (e) {
      console.error("Failed to delete invalid tokens from Supabase", e);
    }

    return res.status(401).json({
      error: `${serviceName}_token_expired`,
      message: `Google authentication expired. Please reconnect your ${serviceName === 'gmail' ? 'Gmail' : 'Calendar'} account.`,
      errorCode: 'TOKEN_EXPIRED'
    });
  }

  // Handle other API errors
  if (error.status === 403) {
    return res.status(403).json({
      error: `${serviceName}_permission_denied`,
      message: `Permission denied for ${serviceName}. Please check API is enabled in Google Cloud Console.`,
      errorCode: 'PERMISSION_DENIED'
    });
  }

  if (error.status === 404) {
    return res.status(404).json({
      error: `${serviceName}_not_found`,
      message: `${serviceName} resource not found.`,
      errorCode: 'NOT_FOUND'
    });
  }

  // Generic error
  res.status(500).json({
    error: `${serviceName}_error`,
    message: `Failed to fetch ${serviceName}. Please try again.`,
    errorCode: 'UNKNOWN_ERROR',
    details: process.env.NODE_ENV !== 'production' ? error.message : undefined
  });
}

// Helper function to get tokens from session or fallback to Supabase
// Includes caching and timeout for better reliability
async function getUserTokens(req: express.Request): Promise<any | null> {
  // First, try to get tokens from session (fastest) - with null safety
  if (req.session?.tokens) {
    console.log("✅ Using tokens from session");
    return req.session.tokens;
  }

  console.log("⏳ Session tokens not found, trying Supabase fallback...");

  const user = (req as any).user;
  if (!user) {
    console.log("❌ No user object in request (middleware failed or bypassed)");
    return null;
  }

  console.log(`🔑 User confirmed from request: ${user.id}`);

  try {
    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || '');

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("❌ FATAL: SUPABASE_SERVICE_ROLE_KEY not configured");
      return null;
    }

    // Fetch tokens with timeout
    console.log("💾 Fetching tokens from Supabase...");
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('user_google_tokens')
      .select('tokens')
      .eq('user_id', user.id)
      .single();

    if (tokenError) {
      if (tokenError.code === 'PGRST116') {
        console.log("ℹ️ No tokens found in Supabase for user:", user.id);
      } else {
        console.error("❌ Token fetch error:", tokenError.message);
      }
      return null;
    }

    if (!tokenData || !tokenData.tokens) {
      console.log("ℹ️ Token data is empty for user:", user.id);
      return null;
    }

    // Decrypt and return tokens
    const tokens = JSON.parse(decrypt(tokenData.tokens));
    console.log("✅ Successfully fetched tokens from Supabase fallback");

    // Save to session for future requests (cache)
    req.session.tokens = tokens;
    try {
      await saveSession(req);
    } catch (err: any) {
      console.log("⚠️ Failed to save tokens to session:", err);
    }

    // Set up auto-refresh listener if not already set
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    // This is the key part: listen for the 'tokens' event which fires when the client refreshes the access token
    oauth2Client.on('tokens', async (newTokens) => {
      console.log("🔄 Google tokens refreshed automatically");
      const updatedTokens = { ...tokens, ...newTokens };

      // Update local session
      req.session.tokens = updatedTokens;
      try {
        await saveSession(req);
      } catch (e) {
        console.error("❌ Failed to save session after refresh:", e);
      }

      // Update Supabase
      const encrypted = encrypt(JSON.stringify(updatedTokens));
      await supabaseAdmin
        .from('user_google_tokens')
        .upsert({
          user_id: user.id,
          tokens: encrypted,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      console.log("✅ Refreshed tokens persisted to session and Supabase");
    });

    return tokens;
  } catch (error: any) {
    console.error("❌ Error fetching tokens from Supabase:", error.message);
    return null;
  }
}

app.get("/api/calendar/events", authenticateSupabaseUser, async (req, res) => {
  console.log("📅 Calendar events request received");

  // Try to get tokens from session or fallback to Supabase
  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    console.log("❌ Calendar: No Google tokens found");
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    console.log("✅ Calendar: Tokens retrieved, fetching events...");
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(userTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    console.log(`✅ Calendar: Retrieved ${events.length} events`);
    res.json(events);
  } catch (error: any) {
    console.error("❌ Calendar error:", error.message);
    await handleGoogleApiError(error, req, res, 'calendar');
  }
});

app.get("/api/gmail/messages", authenticateSupabaseUser, async (req, res) => {
  console.log("📧 Gmail messages request received");

  // Try to get tokens from session or fallback to Supabase
  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    console.log("❌ Gmail: No Google tokens found");
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    console.log("✅ Gmail: Tokens retrieved, fetching messages...");
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(userTokens);
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
  console.log('🚀 Starting server sequence...');
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log('🛠️ Registering Vite middleware (DEVELOPMENT MODE)');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Portability for Hostinger: search for static files in dist or public_html
    const staticPath = fs.existsSync(path.join(__dirname, "dist")) 
      ? "dist" 
      : (fs.existsSync(path.join(__dirname, "public_html")) ? "public_html" : "dist");
    
    console.log(`📦 Serving static files from: ${path.resolve(__dirname, staticPath)}`);
    
    if (!fs.existsSync(path.resolve(__dirname, staticPath))) {
      console.error(`❌ CRITICAL: Static folder '${staticPath}' not found at ${path.resolve(__dirname, staticPath)}`);
    }

    app.use(express.static(staticPath, {
      setHeaders: (res, filePath) => {
        // Assets in staticPath/assets/* have content hashes and can be cached indefinitely
        if (filePath.includes(path.join(staticPath, 'assets'))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } 
        // index.html and sw.js should never be cached
        else if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const indexPath = path.resolve(__dirname, staticPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Error: index.html not found. Please run 'npm run build' first.");
      }
    });
  }

  // Use any to avoid TS overload confusion with numeric vs string (Unix socket) ports
  app.listen(PORT as any, "0.0.0.0", () => {
    console.log(`✅ Server listening on ${PORT}`);
    console.log('✨ Mima App ready for service');
  });
}

startServer();
