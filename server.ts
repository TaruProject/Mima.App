import dotenv from "dotenv";
dotenv.config();

import express from "express";
// Vite is imported dynamically in startServer() to save memory in production
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
} from "./src/services/userPreferencesService.js";
import {
  buildSystemPrompt,
  getMimaStyle,
  normalizeStyleId,
  type MimaStyleId,
} from "./src/config/mimaStyles.js";
import {
  BUILD_ID,
  BUILD_TIMESTAMP,
  BUILD_VERSION,
} from "./src/generated/buildInfo.js";

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

// Environment variables validation - deferred until after dotenv loads completely
let envValidationComplete = false;
let envValidationResult = { valid: false, missing: [] as string[], critical: [] as string[] };

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

const criticalVars = ['GEMINI_API_KEY', 'SESSION_SECRET', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

// Validate after a short delay to ensure dotenv has loaded completely
setTimeout(() => {
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  const missingCritical = missingVars.filter(v => criticalVars.includes(v));

  envValidationResult = {
    valid: missingCritical.length === 0,
    missing: missingVars,
    critical: missingCritical
  };
  envValidationComplete = true;

  if (missingCritical.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables:', missingCritical.join(', '));
  } else if (missingVars.length > 0) {
    console.warn('⚠️  WARNING: Some optional variables are missing:', missingVars.join(', '));
  } else {
    console.log('✅ All environment variables loaded successfully');
  }
}, 100);

const app = express();

// Immediate ping endpoint before anything else can fail
app.get("/api/ping", (req, res) => res.status(200).send("pong"));

// Port 3000 as fallback. Hostinger may provide a numeric port or a Unix Socket string.
const PORT = process.env.PORT || 3000;

// Determine environment explicitly
const IS_HOSTINGER = !!process.env.HOSTINGER_ENV || !!process.env.HOSTINGER || process.env.USER === 'u482312211'; // Common Hostinger user pattern
const IS_PROD = process.env.NODE_ENV === 'production' || IS_HOSTINGER || (!!process.env.PORT && process.env.PORT !== '3000');

// Log environment detection IMMEDIATELY
console.log('═══════════════════════════════════════════');
console.log('🚀 MIMA SERVER STARTING');
console.log('═══════════════════════════════════════════');
console.log('🔍 Environment detection:', {
  NODE_ENV: process.env.NODE_ENV || 'not set',
  PORT: process.env.PORT || 'not set',
  IS_HOSTINGER,
  IS_PROD
});

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
const SERVER_STARTED_AT = BUILD_TIMESTAMP;
const SERVER_DEPLOY_ID = BUILD_ID;

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

// NOTE: Panic middleware removed - env validation now happens asynchronously
// Errors are reported via /api/health and /api/health-detailed endpoints instead of 503

app.use(express.json({ limit: '15mb' }));
app.set('trust proxy', 1); // Required for secure cookies behind proxy

// CSP headers - Unified for all environments
app.use((req, res, next) => {
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://accounts.google.com https://*.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https://api.google.com https://generativelanguage.googleapis.com https://*.supabase.co https://api.elevenlabs.io https://*.googleapis.com https://accounts.google.com",
    "img-src 'self' data: https: blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://accounts.google.com https://*.google.com"
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  next();
});

// Session configuration optimized for Hostinger
app.use(session({
  secret: process.env.SESSION_SECRET || 'mima-session-fallback-secret',
  resave: false,
  saveUninitialized: false,
  name: 'mima.session', // Specific cookie name to avoid conflicts
  cookie: {
    secure: IS_PROD, // Require HTTPS in production
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true // Security: prevent XSS access to cookie
  }
}));

// Log session configuration on startup
console.log('🔧 Session configuration:');
console.log('   - Cookie secure:', IS_PROD);
console.log('   - Cookie sameSite:', IS_PROD ? 'none' : 'lax');
console.log('   - Cookie httpOnly: true');
console.log('   - Trust proxy: enabled');

declare module 'express-session' {
  interface SessionData {
    tokens: any;
    userId?: string;
  }
}

// Helper function to save session reliably with retries
async function saveSession(req: express.Request, maxRetries = 3): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      console.log(`✅ Session saved successfully (attempt ${attempt})`);
      return; // Success
    } catch (err: any) {
      lastError = err;
      console.error(`❌ Session save error (attempt ${attempt}/${maxRetries}):`, err.message);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Staggered retry
      }
    }
  }

  // All retries failed
  console.error('❌ Session save failed after all retries');
  throw lastError;
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
  } else if (!IS_PROD) {
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

type GoogleServiceName = 'calendar' | 'gmail';

const GOOGLE_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const GOOGLE_WRITE_SCOPES: Record<GoogleServiceName, string[]> = {
  calendar: ['https://www.googleapis.com/auth/calendar'],
  gmail: [
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send'
  ]
};

const GOOGLE_SCOPE_VERSION = 1;

function normalizeGoogleScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) {
    return scopes
      .filter((scope): scope is string => typeof scope === 'string' && scope.length > 0)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  if (typeof scopes === 'string') {
    return scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  return [];
}

function getMissingGoogleScopes(tokens: any, requiredScopes: string[]): string[] {
  const granted = new Set(normalizeGoogleScopes(tokens?.granted_scopes ?? tokens?.scope));
  return requiredScopes.filter((scope) => !granted.has(scope));
}

function isGoogleScopeError(error: any): boolean {
  const message = String(error?.message || '');
  return (
    error?.errorCode === 'RECONNECT_REQUIRED' ||
    /insufficient|insufficient permissions|insufficientpermission|forbidden|scope|permission/i.test(message)
  );
}

async function resolveGrantedGoogleScopes(tokens: any, req?: express.Request): Promise<string[]> {
  const existingScopes = normalizeGoogleScopes(tokens?.granted_scopes ?? tokens?.scope);

  if (!tokens?.access_token) {
    return existingScopes;
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);
    const tokenInfo: any = await oauth2Client.getTokenInfo(tokens.access_token);
    return normalizeGoogleScopes(tokenInfo?.scopes ?? tokenInfo?.scope ?? existingScopes);
  } catch (error: any) {
    console.warn("⚠️ Failed to resolve granted Google scopes:", error.message);
    return existingScopes;
  }
}

async function attachGoogleScopeMetadata(tokens: any, req?: express.Request): Promise<any> {
  if (!tokens) return tokens;

  const grantedScopes = await resolveGrantedGoogleScopes(tokens, req);
  return {
    ...tokens,
    granted_scopes: grantedScopes,
    scope_version: GOOGLE_SCOPE_VERSION,
  };
}

function googleScopeMetadataChanged(previousTokens: any, nextTokens: any): boolean {
  const previousVersion = previousTokens?.scope_version ?? 0;
  const nextVersion = nextTokens?.scope_version ?? 0;
  if (previousVersion !== nextVersion) {
    return true;
  }

  const previousScopes = normalizeGoogleScopes(previousTokens?.granted_scopes ?? previousTokens?.scope).sort();
  const nextScopes = normalizeGoogleScopes(nextTokens?.granted_scopes ?? nextTokens?.scope).sort();
  return JSON.stringify(previousScopes) !== JSON.stringify(nextScopes);
}

async function persistGoogleTokens(userId: string, tokens: any, req?: express.Request): Promise<void> {
  if (req) {
    req.session.tokens = tokens;
    try {
      await saveSession(req);
    } catch (sessionError) {
      console.warn("⚠️ Failed to persist Google tokens in session:", sessionError);
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return;
  }

  const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
  const encryptedTokens = encrypt(JSON.stringify(tokens));

  const { error } = await supabaseAdmin
    .from('user_google_tokens')
    .upsert({
      user_id: userId,
      tokens: encryptedTokens,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(`Database upsert failed: ${error.message}`);
  }
}

async function ensureGoogleWriteAccess(tokens: any, serviceName: GoogleServiceName, req?: express.Request): Promise<any> {
  const enrichedTokens = await attachGoogleScopeMetadata(tokens, req);
  const missingScopes = getMissingGoogleScopes(enrichedTokens, GOOGLE_WRITE_SCOPES[serviceName]);

  if (missingScopes.length > 0) {
    const serviceLabel = serviceName === 'calendar' ? 'Google Calendar' : 'Gmail';
    const error: any = new Error(`${serviceLabel} needs additional write permissions`);
    error.status = 403;
    error.code = 403;
    error.errorCode = 'RECONNECT_REQUIRED';
    error.serviceName = serviceName;
    error.missingScopes = missingScopes;
    throw error;
  }

  return enrichedTokens;
}

function getGoogleAccessState(tokens: any) {
  const calendarMissingScopes = getMissingGoogleScopes(tokens, GOOGLE_WRITE_SCOPES.calendar);
  const gmailMissingScopes = getMissingGoogleScopes(tokens, GOOGLE_WRITE_SCOPES.gmail);

  return {
    hasCalendarWrite: calendarMissingScopes.length === 0,
    hasGmailWrite: gmailMissingScopes.length === 0,
    calendarMissingScopes,
    gmailMissingScopes,
  };
}

function shouldHandlePermissionFollowUp(message: string, history: any[] = []): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  const followUpPattern = /\b(ya se lo di|ya lo di|ya di el permiso|ya reconecte|ya reconecté|already gave it|already granted|already reconnected|i already did|i already gave permission)\b/i;

  if (followUpPattern.test(normalizedMessage)) {
    return true;
  }

  if (normalizedMessage.length > 80) {
    return false;
  }

  const lastAssistantMessage = [...history]
    .reverse()
    .find((entry: any) => entry?.role === 'assistant' || entry?.role === 'model');

  const assistantText = String(lastAssistantMessage?.content || '').toLowerCase();
  return /permiso de escritura|write permission|reconnect google|reconecta google|read-only|solo lectura/.test(assistantText);
}

function getPermissionStatusFollowUpMessage(
  langCode: string,
  accessState: ReturnType<typeof getGoogleAccessState>,
): string {
  const stillMissingCalendar = !accessState.hasCalendarWrite;
  const stillMissingGmail = !accessState.hasGmailWrite;

  const messages: Record<string, { both: string; calendar: string; gmail: string; ok: string }> = {
    en: {
      both: 'I still see Google Calendar and Gmail without write access on the server. I cannot assume the permission changed just from the chat. Please reconnect Google from Profile and try again after the app confirms it.',
      calendar: 'I still see Google Calendar without write access on the server. I cannot assume the permission changed just from the chat. Please reconnect Google from Profile and try again after the app confirms it.',
      gmail: 'I still see Gmail without write access on the server. I cannot assume the permission changed just from the chat. Please reconnect Google from Profile and try again after the app confirms it.',
      ok: 'The server already sees Google with write access. You can try the action again now.',
    },
    es: {
      both: 'Sigo viendo Google Calendar y Gmail sin permiso de escritura en el servidor. No puedo asumir desde el chat que el permiso ya cambio. Reconecta Google desde Perfil y vuelve a intentarlo cuando la app lo confirme.',
      calendar: 'Sigo viendo Google Calendar sin permiso de escritura en el servidor. No puedo asumir desde el chat que el permiso ya cambio. Reconecta Google desde Perfil y vuelve a intentarlo cuando la app lo confirme.',
      gmail: 'Sigo viendo Gmail sin permiso de escritura en el servidor. No puedo asumir desde el chat que el permiso ya cambio. Reconecta Google desde Perfil y vuelve a intentarlo cuando la app lo confirme.',
      ok: 'El servidor ya ve Google con permiso de escritura. Puedes volver a intentar la accion ahora.',
    },
    fi: {
      both: 'Palvelin nayttaa edelleen Google Calendarin ja Gmailin ilman kirjoitusoikeutta. En voi olettaa chatin perusteella, etta oikeus jo muuttui. Yhdista Google uudelleen Profiilista ja yrita sitten uudestaan, kun sovellus vahvistaa sen.',
      calendar: 'Palvelin nayttaa edelleen Google Calendarin ilman kirjoitusoikeutta. En voi olettaa chatin perusteella, etta oikeus jo muuttui. Yhdista Google uudelleen Profiilista ja yrita sitten uudestaan, kun sovellus vahvistaa sen.',
      gmail: 'Palvelin nayttaa edelleen Gmailin ilman kirjoitusoikeutta. En voi olettaa chatin perusteella, etta oikeus jo muuttui. Yhdista Google uudelleen Profiilista ja yrita sitten uudestaan, kun sovellus vahvistaa sen.',
      ok: 'Palvelin naykee jo Googlen kirjoitusoikeudella. Voit yrittää toimintoa nyt uudelleen.',
    },
    sv: {
      both: 'Servern visar fortfarande Google Calendar och Gmail utan skrivbehorighet. Jag kan inte anta via chatten att behorigheten redan andrades. Anslut Google pa nytt fran Profil och forsok igen nar appen har bekräftat det.',
      calendar: 'Servern visar fortfarande Google Calendar utan skrivbehorighet. Jag kan inte anta via chatten att behorigheten redan andrades. Anslut Google pa nytt fran Profil och forsok igen nar appen har bekräftat det.',
      gmail: 'Servern visar fortfarande Gmail utan skrivbehorighet. Jag kan inte anta via chatten att behorigheten redan andrades. Anslut Google pa nytt fran Profil och forsok igen nar appen har bekräftat det.',
      ok: 'Servern ser redan Google med skrivbehorighet. Du kan prova atgarden igen nu.',
    },
  };

  const selected = messages[langCode] || messages.en;
  if (stillMissingCalendar && stillMissingGmail) return selected.both;
  if (stillMissingCalendar) return selected.calendar;
  if (stillMissingGmail) return selected.gmail;
  return selected.ok;
}

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
      nodeEnv: process.env.NODE_ENV,
      envValidationComplete,
      envValidation: envValidationComplete ? envValidationResult : 'pending'
    }
  });
});

app.get("/api/version", (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    appVersion: BUILD_VERSION,
    deployId: SERVER_DEPLOY_ID,
    startedAt: SERVER_STARTED_AT,
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
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      isHostinger: IS_HOSTINGER,
      isProd: IS_PROD
    },
    envValidation: {
      complete: envValidationComplete,
      valid: envValidationResult.valid,
      missing: envValidationResult.missing,
      critical: envValidationResult.critical
    }
  };

  // If Gemini failed, mark as degraded
  if (!geminiInitialized && geminiInitError) {
    healthData.status = "degraded";
  }

  // If env validation failed, mark as error
  if (envValidationComplete && !envValidationResult.valid) {
    healthData.status = "error";
  }

  res.json(healthData);
});

// Environment variables status endpoint
app.get("/api/health/env", (req, res) => {
  res.json({
    complete: envValidationComplete,
    valid: envValidationResult.valid,
    missing: envValidationResult.missing,
    critical: envValidationResult.critical,
    all: requiredEnvVars.map(v => ({
      name: v,
      present: !!process.env[v],
      critical: criticalVars.includes(v)
    }))
  });
});

// Simple health check for Gemini configuration - Development only
app.get("/api/test/gemini-config", (req, res) => {
  // Only allow in development
  if (IS_PROD) {
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

// Test endpoint for Gemini API - use this to verify the chat is working - Development only
app.get("/api/test/gemini", async (req, res) => {
  // Only allow in development
  if (IS_PROD) {
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
  if (IS_PROD) {
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
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_REQUIRED_SCOPES,
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

      finalTokens = await attachGoogleScopeMetadata(finalTokens, req);

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
      console.log("   Upserting to user_google_tokens table...");
      await persistGoogleTokens(userId, finalTokens);

      console.log("✅ Tokens saved to Supabase successfully");
    } else {
      // Save to session only
      console.log("   Supabase not configured, saving to session only");
      finalTokens = await attachGoogleScopeMetadata(finalTokens, req);
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
  try {
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    let resolvedTokens = req.session.tokens ?? null;

    if (!resolvedTokens && userId) {
      const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
      const { data, error } = await supabaseAdmin
        .from('user_google_tokens')
        .select('tokens')
        .eq('user_id', userId)
        .single();

      if (error || !data || !data.tokens) {
        return res.json({ isConnected: false, hasWriteAccess: false, reconnectRequired: false, missingScopes: [] });
      }

      resolvedTokens = JSON.parse(decrypt(data.tokens));
    }

    if (!resolvedTokens) {
      return res.json({ isConnected: false, hasWriteAccess: false, reconnectRequired: false, missingScopes: [] });
    }

    const enrichedTokens = await attachGoogleScopeMetadata(resolvedTokens, req);
    if (userId && googleScopeMetadataChanged(resolvedTokens, enrichedTokens)) {
      await persistGoogleTokens(userId, enrichedTokens, req);
    } else {
      req.session.tokens = enrichedTokens;
    }

    const missingScopes = getMissingGoogleScopes(enrichedTokens, [
      ...GOOGLE_WRITE_SCOPES.calendar,
      ...GOOGLE_WRITE_SCOPES.gmail
    ]);

    return res.json({
      isConnected: true,
      hasWriteAccess: missingScopes.length === 0,
      reconnectRequired: missingScopes.length > 0,
      missingScopes,
    });
  } catch (error) {
    console.error("Error checking token status in Supabase:", error);
    return res.json({ isConnected: false, hasWriteAccess: false, reconnectRequired: false, missingScopes: [] });
  }
});

app.delete("/api/auth/google", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    req.session.tokens = undefined;

    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
    const { error } = await supabaseAdmin
      .from('user_google_tokens')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error("Failed to disconnect Google tokens:", error.message);
      return res.status(500).json({
        error: "Failed to disconnect Google",
        errorCode: "GOOGLE_DISCONNECT_FAILED",
      });
    }

    try {
      await saveSession(req);
    } catch (sessionError) {
      console.warn("Failed to persist cleared Google session:", sessionError);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Error disconnecting Google:", error);
    return res.status(500).json({
      error: "Failed to disconnect Google",
      details: error.message,
      errorCode: "GOOGLE_DISCONNECT_FAILED",
    });
  }
});

// ---- User Preferences Endpoints ----

// Get user preferences
app.get("/api/user/preferences", authenticateSupabaseUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const preferences = await getUserPreferences(user.id);
    
    if (!preferences) {
      console.warn(`⚠️ No preferences found for user ${user.id}, returning defaults`);
      return res.json({
        user_id: user.id,
        onboarding_done: false,
        voice_id: 'DODLEQrClDo8wCz460ld',
        language: 'en'
      });
    }

    console.log(`✅ Preferences loaded for user ${user.id}:`, { onboarding_done: preferences.onboarding_done });
    res.json(preferences);
  } catch (error: any) {
    console.error("❌ Error fetching user preferences:", error);
    res.status(500).json({ 
      error: "Failed to fetch user preferences", 
      details: error.message,
      errorCode: "DB_PREFS_FETCH_FAILED"
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
      console.error("❌ Failed to update user preferences in database");
      res.status(500).json({ error: "Failed to save preferences to database" });
    }
  } catch (error: any) {
    console.error("❌ Error updating user preferences:", error);
    res.status(500).json({ error: "Internal server error during preferences update", details: error.message });
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
    console.error("❌ Error fetching chat history:", error);
    res.status(500).json({ error: "Failed to fetch chat history", details: error.message });
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
      console.error("❌ Failed to save chat message to database");
      res.status(500).json({ error: "Failed to save message to database" });
    }
  } catch (error: any) {
    console.error("❌ Error saving chat message:", error);
    res.status(500).json({ error: "Internal server error during message save", details: error.message });
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
      res.status(500).json({ success: false, error: 'Failed to clear chat history' });
    }
  } catch (error: any) {
    console.error("Error clearing chat history:", error);
    res.status(500).json({ success: false, error: 'Failed to clear chat history', details: error.message });
  }
});

const ttsPreviewCache: Record<string, string> = {};

app.get("/api/tts/preview", authenticateSupabaseUser, async (req, res) => {
  const { voiceId, text } = req.query;
  if (!voiceId || typeof voiceId !== 'string') {
    return res.status(400).json({ error: "voiceId is required" });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY is not configured" });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: typeof text === 'string' && text.trim() ? text : "Hi, I am Mima. This is how I sound.",
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

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audioBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', 'inline; filename="mima-preview.mp3"');
    res.send(audioBuffer);
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

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audioBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', 'inline; filename="mima-response.mp3"');
    res.send(audioBuffer);
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

function normalizeDateTextForParsing(dateText: string, language?: string): string {
  let normalized = dateText.trim().toLowerCase();

  const sharedReplacements: Array<[RegExp, string]> = [
    [/\bpasado manana\b/g, 'day after tomorrow'],
    [/\bpasado mañana\b/g, 'day after tomorrow'],
    [/\bmanana\b/g, 'tomorrow'],
    [/\bmañana\b/g, 'tomorrow'],
    [/\bhoy\b/g, 'today'],
    [/\beste fin de semana\b/g, 'this weekend'],
    [/\bla proxima semana\b/g, 'next week'],
    [/\bla próxima semana\b/g, 'next week'],
    [/\besta semana\b/g, 'this week'],
    [/\bproximo mes\b/g, 'next month'],
    [/\bpróximo mes\b/g, 'next month'],
    [/\ba las\b/g, 'at'],
    [/\bidag\b/g, 'today'],
    [/\bimorgon\b/g, 'tomorrow'],
    [/\bi morgon\b/g, 'tomorrow'],
    [/\bi overmorgon\b/g, 'day after tomorrow'],
    [/\bnasta vecka\b/g, 'next week'],
    [/\bnästa vecka\b/g, 'next week'],
    [/\bden har veckan\b/g, 'this week'],
    [/\bden här veckan\b/g, 'this week'],
    [/\bpa\b/g, 'at'],
    [/\bpå\b/g, 'at'],
    [/\btanaan\b/g, 'today'],
    [/\btänään\b/g, 'today'],
    [/\bhuomenna\b/g, 'tomorrow'],
    [/\bylihuomenna\b/g, 'day after tomorrow'],
    [/\bensi viikko\b/g, 'next week'],
    [/\btalla viikolla\b/g, 'this week'],
    [/\btällä viikolla\b/g, 'this week'],
    [/\bensi kuu\b/g, 'next month'],
    [/\bklo\b/g, 'at'],
    [/\bmaanantai\b/g, 'monday'],
    [/\btiistai\b/g, 'tuesday'],
    [/\bkeskiviikko\b/g, 'wednesday'],
    [/\btorstai\b/g, 'thursday'],
    [/\bperjantai\b/g, 'friday'],
    [/\blauantai\b/g, 'saturday'],
    [/\bsunnuntai\b/g, 'sunday'],
    [/\blunes\b/g, 'monday'],
    [/\bmartes\b/g, 'tuesday'],
    [/\bmiercoles\b/g, 'wednesday'],
    [/\bmiércoles\b/g, 'wednesday'],
    [/\bjueves\b/g, 'thursday'],
    [/\bviernes\b/g, 'friday'],
    [/\bsabado\b/g, 'saturday'],
    [/\bsábado\b/g, 'saturday'],
    [/\bdomingo\b/g, 'sunday'],
  ];

  for (const [pattern, replacement] of sharedReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  if (language === 'fi') {
    normalized = normalized.replace(/\bensi\b/g, 'next');
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function getChronoParsers(language?: string): Array<{ parse: typeof chrono.parse }> {
  const englishParser = { parse: chrono.parse.bind(chrono) };
  const spanishParser = { parse: chrono.es.parse.bind(chrono.es) };
  const swedishParser = { parse: chrono.sv.parse.bind(chrono.sv) };

  switch (language) {
    case 'es':
      return [spanishParser, englishParser, swedishParser];
    case 'sv':
      return [swedishParser, englishParser, spanishParser];
    case 'fi':
      return [englishParser, spanishParser, swedishParser];
    default:
      return [englishParser, spanishParser, swedishParser];
  }
}

// Parse natural language date using chrono-node
function parseNaturalDate(
  dateText: string,
  options?: { referenceDate?: Date; language?: string }
): { start: Date; end?: Date; isAllDay: boolean } | null {
  const refDate = options?.referenceDate || new Date();
  const candidates = Array.from(
    new Set([dateText.trim(), normalizeDateTextForParsing(dateText, options?.language)].filter(Boolean))
  );

  for (const parser of getChronoParsers(options?.language)) {
    for (const candidate of candidates) {
      const results = parser.parse(candidate, refDate, { forwardDate: true });

      if (results.length === 0) {
        continue;
      }

      const result = results[0];
      const start = result.start.date();
      const end = result.end ? result.end.date() : undefined;

      // Check if it's an all-day event (no specific time mentioned)
      const isAllDay = !result.start.isCertain('hour');

      return { start, end, isAllDay };
    }
  }

  return null;
}

// Create a calendar event
async function createCalendarEvent(userTokens: any, eventData: CalendarEventData): Promise<any> {
  const writableTokens = await ensureGoogleWriteAccess(userTokens, 'calendar');
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(writableTokens);
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
  const writableTokens = await ensureGoogleWriteAccess(userTokens, 'calendar');
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(writableTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
  });
}

// Update a calendar event
async function updateCalendarEvent(userTokens: any, eventId: string, updates: Partial<CalendarEventData>): Promise<any> {
  const writableTokens = await ensureGoogleWriteAccess(userTokens, 'calendar');
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(writableTokens);
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

function formatCalendarEventLine(event: any, langCode: string): string {
  const start = event.start?.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString(langCode, { hour: '2-digit', minute: '2-digit' })
    : 'Todo el dia';

  return `${start}: ${event.summary || 'Sin titulo'}`;
}

function formatCalendarListResponse(
  styleId: MimaStyleId,
  langCode: string,
  dateLabel: string,
  events: any[]
): string {
  if (events.length === 0) {
    return langCode === 'es'
      ? `No tienes eventos programados para ${dateLabel}.`
      : `No events scheduled for ${dateLabel}.`;
  }

  const lines = events.map((event: any) => formatCalendarEventLine(event, langCode));

  if (styleId === 'zen') {
    return lines.join('\n');
  }

  if (styleId === 'profesional') {
    return `Agenda para ${dateLabel}:\n\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`;
  }

  if (styleId === 'creativo') {
    return `Tu mapa del dia para ${dateLabel}:\n\n${lines.map((line) => `- ${line}`).join('\n')}`;
  }

  if (styleId === 'familiar') {
    return `Para ${dateLabel} tienes esto:\n\n${lines.map((line) => `- ${line}`).join('\n')}`;
  }

  return `Eventos para ${dateLabel}:\n\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

function formatCalendarCreationResponse(
  styleId: MimaStyleId,
  langCode: string,
  summary: string,
  startDate: Date,
  htmlLink?: string | null
): string {
  const dateText = startDate.toLocaleString(langCode, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (styleId === 'zen') {
    return htmlLink ? `Creado: ${summary} - ${dateText}\n[Ver en Google Calendar](${htmlLink})` : `Creado: ${summary} - ${dateText}`;
  }

  if (styleId === 'profesional') {
    return htmlLink ? `Evento confirmado: "${summary}" - ${dateText}.\n[Ver en Google Calendar](${htmlLink})` : `Evento confirmado: "${summary}" - ${dateText}.`;
  }

  if (styleId === 'creativo') {
    return htmlLink ? `Listo, ya quedo agendado "${summary}" para ${dateText}.\n[Ver en Google Calendar](${htmlLink})` : `Listo, ya quedo agendado "${summary}" para ${dateText}.`;
  }

  if (styleId === 'familiar') {
    return htmlLink ? `Listo, ya te apunte "${summary}" para ${dateText}.\n[Ver en Google Calendar](${htmlLink})` : `Listo, ya te apunte "${summary}" para ${dateText}.`;
  }

  return htmlLink ? `Evento creado: "${summary}" para ${dateText}.\n[Ver en Google Calendar](${htmlLink})` : `Evento creado: "${summary}" para ${dateText}.`;
}

function formatCalendarUpdateResponse(styleId: MimaStyleId, summary: string): string {
  if (styleId === 'zen') {
    return `Actualizado: ${summary}`;
  }

  if (styleId === 'familiar') {
    return `Hecho, ya actualice "${summary}".`;
  }

  return `Evento actualizado: "${summary}".`;
}

function formatCalendarDeleteResponse(styleId: MimaStyleId): string {
  if (styleId === 'zen') {
    return 'Evento eliminado.';
  }

  if (styleId === 'familiar') {
    return 'Listo, ese evento ya no esta en tu calendario.';
  }

  return 'Evento eliminado correctamente.';
}

function formatDraftCreatedResponse(styleId: MimaStyleId, to: string, subject: string): string {
  if (styleId === 'zen') {
    return `Borrador creado.\nPara: ${to}\nAsunto: ${subject}`;
  }

  if (styleId === 'profesional') {
    return `Borrador preparado correctamente.\nPara: ${to}\nAsunto: ${subject}\n\nQueda pendiente tu aprobacion antes del envio.`;
  }

  if (styleId === 'familiar') {
    return `Te deje listo este borrador:\nPara: ${to}\nAsunto: ${subject}\n\nLe echas un vistazo y, si quieres, luego lo enviamos.`;
  }

  return `Borrador creado correctamente.\nPara: ${to}\nAsunto: ${subject}\n\nRevisalo antes de enviarlo.`;
}

// ---- Gemini AI Chat Proxy ----
let genAI: GoogleGenAI | null = null;
let geminiInitialized = false;
let geminiInitError: string | null = null;
let geminiInitAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

async function initializeGeminiClient(): Promise<GoogleGenAI | null> {
  if (genAI) return genAI; // Already initialized

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    geminiInitError = "GEMINI_API_KEY is not configured";
    console.error("❌ GEMINI CONFIG ERROR:", geminiInitError);
    return null;
  }

  // Retry with exponential backoff
  for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt++) {
    try {
      console.log(`🔧 Initializing Gemini AI client (attempt ${attempt}/${MAX_INIT_ATTEMPTS})...`);
      genAI = new GoogleGenAI({ apiKey });

      // Verify initialization worked
      if (!genAI) {
        throw new Error("GoogleGenAI constructor returned null");
      }

      geminiInitialized = true;
      geminiInitError = null;
      console.log("✅ Gemini AI client initialized successfully");
      return genAI;
    } catch (error: any) {
      geminiInitError = error.message;
      console.error(`❌ GEMINI INIT ERROR (attempt ${attempt}/${MAX_INIT_ATTEMPTS}):`, error.message);

      if (attempt < MAX_INIT_ATTEMPTS) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  console.error("❌ Gemini initialization failed after all attempts");
  return null;
}

function getGenAI(): GoogleGenAI | null {
  if (!genAI && !geminiInitError) {
    // First call - try to initialize synchronously
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      geminiInitError = "GEMINI_API_KEY is not configured";
      return null;
    }
    try {
      genAI = new GoogleGenAI({ apiKey });
      geminiInitialized = true;
    } catch (error: any) {
      geminiInitError = error.message;
    }
  }
  return genAI;
}

// Pre-initialize Gemini on server start (optional health check)
async function initializeGemini(): Promise<boolean> {
  const client = await initializeGeminiClient();
  return client !== null;
}

function normalizeLookupValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

const timeZoneAliases: Record<string, { timeZone: string; note?: string }> = {
  finland: { timeZone: 'Europe/Helsinki' },
  helsinki: { timeZone: 'Europe/Helsinki' },
  helsingfors: { timeZone: 'Europe/Helsinki' },
  suomi: { timeZone: 'Europe/Helsinki' },
  finlandia: { timeZone: 'Europe/Helsinki' },
  sweden: { timeZone: 'Europe/Stockholm' },
  stockholm: { timeZone: 'Europe/Stockholm' },
  sverige: { timeZone: 'Europe/Stockholm' },
  suecia: { timeZone: 'Europe/Stockholm' },
  estocolmo: { timeZone: 'Europe/Stockholm' },
  spain: { timeZone: 'Europe/Madrid' },
  espana: { timeZone: 'Europe/Madrid' },
  madrid: { timeZone: 'Europe/Madrid' },
  london: { timeZone: 'Europe/London' },
  londres: { timeZone: 'Europe/London' },
  uk: { timeZone: 'Europe/London' },
  'united kingdom': { timeZone: 'Europe/London' },
  england: { timeZone: 'Europe/London' },
  'reino unido': { timeZone: 'Europe/London' },
  paris: { timeZone: 'Europe/Paris' },
  francia: { timeZone: 'Europe/Paris' },
  france: { timeZone: 'Europe/Paris' },
  berlin: { timeZone: 'Europe/Berlin' },
  alemania: { timeZone: 'Europe/Berlin' },
  germany: { timeZone: 'Europe/Berlin' },
  rome: { timeZone: 'Europe/Rome' },
  roma: { timeZone: 'Europe/Rome' },
  italia: { timeZone: 'Europe/Rome' },
  italy: { timeZone: 'Europe/Rome' },
  'new york': { timeZone: 'America/New_York' },
  'nueva york': { timeZone: 'America/New_York' },
  'united states': { timeZone: 'America/New_York', note: 'This uses Eastern Time.' },
  usa: { timeZone: 'America/New_York', note: 'This uses Eastern Time.' },
  'estados unidos': { timeZone: 'America/New_York', note: 'This uses Eastern Time.' },
  chicago: { timeZone: 'America/Chicago' },
  denver: { timeZone: 'America/Denver' },
  'los angeles': { timeZone: 'America/Los_Angeles' },
  tokyo: { timeZone: 'Asia/Tokyo' },
  tokio: { timeZone: 'Asia/Tokyo' },
  japan: { timeZone: 'Asia/Tokyo' },
  japon: { timeZone: 'Asia/Tokyo' },
  seoul: { timeZone: 'Asia/Seoul' },
  seul: { timeZone: 'Asia/Seoul' },
  'south korea': { timeZone: 'Asia/Seoul' },
  'corea del sur': { timeZone: 'Asia/Seoul' },
  shanghai: { timeZone: 'Asia/Shanghai' },
  china: { timeZone: 'Asia/Shanghai' },
  pekin: { timeZone: 'Asia/Shanghai' },
  kolkata: { timeZone: 'Asia/Kolkata' },
  india: { timeZone: 'Asia/Kolkata' },
  bangkok: { timeZone: 'Asia/Bangkok' },
  thailand: { timeZone: 'Asia/Bangkok' },
  tailandia: { timeZone: 'Asia/Bangkok' },
  sydney: { timeZone: 'Australia/Sydney' },
  sidney: { timeZone: 'Australia/Sydney' },
  australia: { timeZone: 'Australia/Sydney', note: 'This uses Sydney time.' },
};

function resolveTimeZone(location: string): { timeZone: string; note?: string } | null {
  const normalized = normalizeLookupValue(location);
  if (!normalized) return null;

  if (timeZoneAliases[normalized]) {
    return timeZoneAliases[normalized];
  }

  const supportedTimeZones = Intl.supportedValuesOf('timeZone');
  const matchedTimeZone = supportedTimeZones.find((timeZone) => {
    const cityName = normalizeLookupValue(timeZone.split('/').pop() || '');
    return cityName === normalized || cityName.includes(normalized) || normalized.includes(cityName);
  });

  if (matchedTimeZone) {
    return { timeZone: matchedTimeZone };
  }

  const candidates: Array<{ label: string; value: { timeZone: string; note?: string } }> = [
    ...Object.entries(timeZoneAliases).map(([label, value]) => ({ label, value })),
    ...supportedTimeZones.map((timeZone) => ({
      label: normalizeLookupValue(timeZone.split('/').pop() || ''),
      value: { timeZone },
    })),
  ];

  let bestMatch: { timeZone: string; note?: string } | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = similarityScore(normalized, candidate.label);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate.value;
    }
  }

  return bestScore >= 0.55 ? bestMatch : null;
}

function getLocalizedCurrentTimeResponse(location: string, langCode: string): string {
  const resolved = resolveTimeZone(location);

  if (!resolved) {
    const messages: Record<string, string> = {
      en: 'I can tell the current time if you give me a city or country I recognize, like Helsinki, Madrid, London, or Tokyo.',
      es: 'Puedo decirte la hora actual si me das una ciudad o un pais que reconozca, como Helsinki, Madrid, Londres o Tokio.',
      fi: 'Voin kertoa kellonajan, jos annat kaupungin tai maan jonka tunnistan, kuten Helsinki, Madrid, Lontoo tai Tokio.',
      sv: 'Jag kan beratta aktuell tid om du ger mig en stad eller ett land som jag kanner igen, som Helsingfors, Madrid, London eller Tokyo.',
    };

    return messages[langCode] || messages.en;
  }

  const now = new Date();
  const formatted = now.toLocaleString(langCode, {
    timeZone: resolved.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const note = resolved.note ? ` ${resolved.note}` : '';
  const templates: Record<string, string> = {
    en: `The current time in ${location} is ${formatted}.${note}`,
    es: `La hora actual en ${location} es ${formatted}.${note}`,
    fi: `Kellonaika paikassa ${location} on nyt ${formatted}.${note}`,
    sv: `Den aktuella tiden i ${location} ar ${formatted}.${note}`,
  };

  return templates[langCode] || templates.en;
}

function extractTimeLocation(message: string): string | null {
  const patterns = [
    /(?:what(?:'s| is) the time in|current time in|time in)\s+(.+)$/i,
    /(?:qu[eé] hora es en|hora en|hora actual en)\s+(.+)$/i,
    /(?:paljonko kello on|mika aika on|kello\s+)\s*(?:on\s+)?(.+)$/i,
    /(?:vad ar klockan i|vad är klockan i|tid i|aktuell tid i)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = message.trim().match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[?.!]+$/, '');
    }
  }

  return null;
}

function extractToolPayload(text: string): string | null {
  let trimmedText = text.trim();

  if (trimmedText.includes('```json')) {
    const match = trimmedText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) trimmedText = match[1].trim();
  } else if (trimmedText.includes('```')) {
    const match = trimmedText.match(/```\s*([\s\S]*?)\s*```/);
    if (match) trimmedText = match[1].trim();
  }

  const jsonMatch = trimmedText.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (jsonMatch) {
    trimmedText = jsonMatch[0].trim();
  }

  if (trimmedText.startsWith('{') && trimmedText.includes('"tool":')) {
    return trimmedText;
  }

  return null;
}

function extractJsonPayload(text: string): string | null {
  let trimmedText = text.trim();

  if (trimmedText.includes('```json')) {
    const match = trimmedText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) trimmedText = match[1].trim();
  } else if (trimmedText.includes('```')) {
    const match = trimmedText.match(/```\s*([\s\S]*?)\s*```/);
    if (match) trimmedText = match[1].trim();
  }

  const jsonMatch = trimmedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0].trim();
  }

  return trimmedText.startsWith('{') ? trimmedText : null;
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function looksLikeCalendarIntent(message: string): boolean {
  const normalized = normalizeLookupValue(message);
  const calendarPhrases = [
    'create event',
    'add event',
    'schedule',
    'calendar',
    'meeting',
    'appointment',
    'reminder',
    'crea evento',
    'crear evento',
    'agenda',
    'calendario',
    'reunion',
    'cita',
    'recordatorio',
    'luo tapahtuma',
    'kalenteri',
    'tapaaminen',
    'muistutus',
    'skapa handelse',
    'kalender',
    'mote',
    'paminnelse',
  ];

  return calendarPhrases.some((phrase) => normalized.includes(normalizeLookupValue(phrase)));
}

async function extractToolCallFromMessage(
  ai: GoogleGenAI,
  message: string,
  langCode: string,
  userHasGoogleTools: boolean
): Promise<string | null> {
  if (!userHasGoogleTools || !looksLikeCalendarIntent(message)) {
    return null;
  }

  try {
    const extractorPrompt =
      `Convert the user's latest request into a single JSON tool call when the intent is clearly about Google Calendar. ` +
      `Available tools: createCalendarEvent, listCalendarEvents, searchCalendarEvents, deleteCalendarEvent, updateCalendarEvent. ` +
      `Return ONLY valid JSON and nothing else. ` +
      `If the request is not clearly a calendar action, return {"tool":"none"}. ` +
      `For createCalendarEvent use keys summary, dateText, description. ` +
      `For listCalendarEvents use keys dateText, maxResults. ` +
      `For searchCalendarEvents use keys query, maxResults. ` +
      `For deleteCalendarEvent use key eventId only if the id is explicitly known. ` +
      `For updateCalendarEvent use keys eventId plus any of summary, description, dateText only if the id is explicitly known. ` +
      `Preserve the original language wording inside summary, description, query, and dateText.`;

    const extraction = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${extractorPrompt}\n\nLanguage: ${langCode}\nUser request: ${message}` },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });

    const payload = extractToolPayload(extraction.text || '');
    if (!payload) {
      return null;
    }

    if (payload.includes('"tool":"none"') || payload.includes('"tool": "none"')) {
      return null;
    }

    return payload;
  } catch (error: any) {
    console.error('Tool extraction fallback failed:', error.message);
    return null;
  }
}

function getCalendarToolErrorMessage(error: any, langCode: string): string {
  const message = String(error?.message || '');
  const isPermissionError =
    error?.status === 403 ||
    error?.code === 403 ||
    isGoogleScopeError(error) ||
    /calendar usage limits/i.test(message);
  const isTokenError =
    error?.status === 401 ||
    /invalid_grant|expired or revoked|refresh token/i.test(message);

  if (isPermissionError) {
    const messages: Record<string, string> = {
      en: 'I need Google Calendar write permission to do that. Please reconnect Google from Calendar so I can create and edit events.',
      es: 'Necesito permiso de escritura en Google Calendar para hacer eso. Vuelve a conectar Google desde Calendario para que pueda crear y editar eventos.',
      fi: 'Tarvitsen Google-kalenterin kirjoitusoikeuden siihen. Yhdista Google uudelleen Kalenteri-nakymasta, jotta voin luoda ja muokata tapahtumia.',
      sv: 'Jag behover skrivbehorighet till Google Kalender for det. Anslut Google pa nytt fran Kalender sa att jag kan skapa och redigera handelser.',
    };

    return messages[langCode] || messages.en;
  }

  if (isTokenError) {
    const messages: Record<string, string> = {
      en: 'Your Google Calendar connection expired. Please reconnect it and try again.',
      es: 'La conexion con Google Calendar expiro. Vuelve a conectarla e intentalo de nuevo.',
      fi: 'Google-kalenteriyhteytesi vanheni. Yhdista se uudelleen ja yrita sitten uudestaan.',
      sv: 'Din Google Kalender-anslutning har gått ut. Anslut den igen och forsok sedan pa nytt.',
    };

    return messages[langCode] || messages.en;
  }

  const messages: Record<string, string> = {
    en: 'I could not complete the calendar action right now. Please try again.',
    es: 'No pude completar la accion de calendario en este momento. Intentalo de nuevo.',
    fi: 'En voinut suorittaa kalenteritoimintoa juuri nyt. Yrita uudelleen.',
    sv: 'Jag kunde inte slutföra kalenderatgarden just nu. Forsok igen.',
  };

  return messages[langCode] || messages.en;
}

const languageInstructions: Record<string, string> = {
  fi: 'Vastaa AINA suomeksi. Käytä luontevaa, ystävällistä suomea.',
  sv: 'Svara ALLTID på svenska. Använd naturlig, vänlig svenska.',
  es: 'Responde SIEMPRE en español. Usa un español natural y amigable.',
  en: 'Always respond in English.',
};

// Model selection router - determines which Gemini model to use
function selectModelForTask(
  message: string,
  mode?: string,
  attachmentCount: number = 0,
): { model: string; reason: string; maxTokens: number } {
  const lowerMsg = message.toLowerCase();
  const activeStyleId = normalizeStyleId(mode);

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
  const isBusinessMode = activeStyleId === 'profesional';
  const hasAttachments = attachmentCount > 0;

  if (hasAttachments && (attachmentCount > 1 || isComplexTask || isLongContext)) {
    return {
      model: 'gemini-2.5-pro',
      reason: 'Attachment analysis requires deeper reasoning and more output budget',
      maxTokens: 2500
    };
  }

  if (hasAttachments) {
    return {
      model: 'gemini-2.5-pro',
      reason: 'Single attachment analysis prioritized for completeness',
      maxTokens: 2200
    };
  }

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

// Debug endpoint to check environment status (safe, no keys revealed) - Development only
app.get("/api/debug/env-status", (req, res) => {
  if (IS_PROD) {
    return res.status(403).json({
      error: "Endpoint disabled in production",
      message: "For security reasons, this endpoint is only available in development"
    });
  }

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
  const { message, mode, language, history, timezone, attachments } = req.body;
  const user = (req as any).user;
  const userId = user.id;
  const activeStyle = getMimaStyle(mode);
  const activeStyleId = activeStyle.id;
  const clientTimeZone = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'UTC';

  console.log("═══════════════════════════════════════════");
  console.log("🤖 CHAT API REQUEST");
  console.log("═══════════════════════════════════════════");
  console.log("   Message:", message?.substring(0, 100));
  console.log("   Mode:", activeStyleId);
  console.log("   Language:", language || 'en');
  console.log("   UserId:", userId);
  console.log("   GEMINI_API_KEY set:", !!process.env.GEMINI_API_KEY);
  console.log("   GEMINI_API_KEY length:", process.env.GEMINI_API_KEY?.length || 0);

  // Log request timestamp for debugging
  const requestStart = Date.now();

  try {
    const currentTimeLocation = typeof message === 'string' ? extractTimeLocation(message) : null;
    if (currentTimeLocation) {
      return res.json({
        text: getLocalizedCurrentTimeResponse(currentTimeLocation, language || 'en')
      });
    }

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

    const resolvedLangCode = language || 'en';
    const resolvedLangInstruction = languageInstructions[resolvedLangCode] || languageInstructions.en;
    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments.filter((attachment: any) => attachment?.data && attachment?.mimeType)
      : [];

    let tokenData: { tokens: string } | null = null;
    let userTokens: any | null = null;
    let googleAccessState = {
      hasCalendarWrite: false,
      hasGmailWrite: false,
      calendarMissingScopes: [...GOOGLE_WRITE_SCOPES.calendar],
      gmailMissingScopes: [...GOOGLE_WRITE_SCOPES.gmail],
    };
    let todayEventsSummary = resolvedLangCode === 'es' ? 'No disponible' : 'Not available';

    if (userId) {
      const tokenResult = await supabaseAdmin
        .from('user_google_tokens')
        .select('tokens')
        .eq('user_id', userId)
        .single();

      tokenData = tokenResult.data || null;

      if (tokenData?.tokens) {
        try {
          userTokens = await attachGoogleScopeMetadata(JSON.parse(decrypt(tokenData.tokens)), req);
          googleAccessState = getGoogleAccessState(userTokens);

          const today = new Date();
          const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
          const todayEvents = await listCalendarEvents(
            userTokens,
            today.toISOString().split('T')[0],
            tomorrow.toISOString().split('T')[0],
            5,
          );

          todayEventsSummary = todayEvents.length > 0
            ? todayEvents.map((event: any) => formatCalendarEventLine(event, resolvedLangCode)).join(' | ')
            : (resolvedLangCode === 'es' ? 'Sin eventos proximos hoy' : 'No upcoming events today');
        } catch (tokenError: any) {
          console.error("Could not prepare user context from Google tokens:", tokenError.message);
          userTokens = null;
        }
      }
    }

    if (shouldHandlePermissionFollowUp(message, Array.isArray(history) ? history : [])) {
      return res.json({
        text: getPermissionStatusFollowUpMessage(resolvedLangCode, googleAccessState),
      });
    }

    // INTELLIGENT MODEL ROUTING
    const modelSelection = selectModelForTask(message, activeStyleId, normalizedAttachments.length);
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
    let calendarToolsInstruction = userTokens ? `

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

    // GMAIL TOOLS INSTRUCTIONS for function calling
    let gmailToolsInstruction = userTokens ? `

GMAIL TOOLS (BORRADORES SEGUROS):
Tienes acceso a Gmail del usuario. IMPORTANTE: NUNCA envíes emails automáticamente. Siempre crea borradores que el usuario debe revisar y aprobar antes de enviar.

Para leer un email completo (cuando el usuario quiere ver el contenido):
{"tool": "readGmailMessage", "messageId": "id_del_email"}

Para crear un borrador de respuesta (SAFE - no se envía):
{"tool": "createGmailDraft", "to": "email@ejemplo.com", "subject": "Re: Asunto original", "body": "<p>Cuerpo del email en HTML</p>", "inReplyTo": "message-id-original", "threadId": "thread-id-opcional"}

Para ver lista de borradores existentes:
{"tool": "listGmailDrafts"}

Para eliminar un borrador:
{"tool": "deleteGmailDraft", "draftId": "id_del_borrador"}

Para ENVIAR un borrador (SOLO con confirmación explícita del usuario):
{"tool": "sendGmailDraft", "draftId": "id_del_borrador", "confirmSend": true}

REGLAS IMPORTANTES DE GMAIL:
1. NUNCA envíes emails sin confirmación explícita del usuario
2. Siempre crea borradores primero
3. Cuando el usuario diga "responde este email", crea un borrador y dile que lo revise
4. El borrador se envía SOLO si el usuario dice explícitamente "envía el borrador" o "sí, envíalo"
5. Usa HTML simple en el cuerpo (<p>, <br>, <b>, etc.)
6. Para respuestas, usa "Re: " en el asunto y mantén el threadId original

EJEMPLO DE FLUJO SEGURO:
Usuario: "Responde este email diciendo que estaré allí"
Tú: {"tool": "createGmailDraft", "to": "persona@ejemplo.com", "subject": "Re: Reunión", "body": "<p>Hola,<br>Estaré allí. Saludos.</p>", "inReplyTo": "message-id-original"}
Tú (después): "He creado un borrador. ¿Quieres que lo envíe?"
Usuario: "Sí, envíalo"
Tú: {"tool": "sendGmailDraft", "draftId": "id_del_borrador", "confirmSend": true}

Si NO es una petición de Gmail, responde normalmente.` : '';

    if (userTokens && !googleAccessState.hasCalendarWrite) {
      calendarToolsInstruction = `

CALENDAR STATUS:
Google Calendar del usuario esta conectado solo en modo lectura. Puedes consultar o buscar eventos, pero NO puedes crear, editar ni eliminar nada hasta que el usuario reconecte Google desde Perfil.
Si el usuario dice que ya dio el permiso, NO asumas que es cierto. Solo puedes considerar que hay escritura cuando el servidor lo confirma.

Para ver eventos:
{"tool": "listCalendarEvents", "dateText": "esta semana", "maxResults": 10}

Para buscar eventos por nombre:
{"tool": "searchCalendarEvents", "query": "reunion", "maxResults": 10}

Si el usuario pide crear, editar o eliminar eventos, responde de forma breve explicando que Google Calendar sigue sin permiso de escritura y que debe reconectar Google desde Perfil.`;
    }

    if (userTokens && !googleAccessState.hasGmailWrite) {
      gmailToolsInstruction = `

GMAIL STATUS:
Gmail del usuario esta conectado solo en modo lectura. Puedes leer correos, pero NO puedes crear, editar ni enviar borradores hasta que el usuario reconecte Google desde Perfil.
Si el usuario dice que ya dio el permiso, NO asumas que es cierto. Solo puedes considerar que hay escritura cuando el servidor lo confirma.

Para leer un email completo:
{"tool": "readGmailMessage", "messageId": "id_del_email"}

Si el usuario pide crear, editar o enviar borradores, responde de forma breve explicando que Gmail sigue sin permiso de escritura y que debe reconectar Google desde Perfil.`;
    }

    // CRITICAL: Explicit system prompt with language enforcement
    const systemInstruction = `${modeInstruction}\n\n${langInstruction}\n\n${calendarToolsInstruction}\n\n` +
      `STRICT INSTRUCTIONS:\n` +
      `1. You MUST ALWAYS respond in the user's selected language: ${langCode}.\n` +
      `2. Do not use any other language unless explicitly asked by the user.\n` +
      `3. If you use a tool (JSON format), that's the only thing you should return.\n` +
      `4. Maintain the persona: ${mode || 'Neutral'}.`;

    const enhancedSystemInstruction = `${systemInstruction}\n` +
      `5. You are multilingual and can communicate naturally in the user's requested language.\n` +
      `6. If the user asks whether you can speak another language, the answer is yes.\n` +
      `7. If the user asks for the current time in a city or country, return ONLY this JSON format: {"tool":"getCurrentTime","location":"City or Country"}.\n` +
      `8. If the user asks to create, update, delete, search, or list calendar events, prefer the calendar tool JSON formats.\n` +
      `9. Current server time (UTC) is ${new Date().toISOString()}.`;

    console.log("📝 System prompt prepared (length:", systemInstruction.length, ")");
    console.log("📝 Language instruction:", langInstruction);
    console.log("📝 Model to use:", modelSelection.model);
    console.log("📝 Max tokens:", modelSelection.maxTokens);

    const capabilities = [
      'Consultas de informacion general',
      ...(normalizedAttachments.length > 0
        ? [`Analisis profundo de ${normalizedAttachments.length} archivo(s) adjunto(s) del usuario`]
        : []),
      ...(userTokens
        ? [
            googleAccessState.hasCalendarWrite
              ? 'Gestion de Google Calendar (crear, editar, eliminar y consultar eventos)'
              : 'Google Calendar conectado solo en lectura (solo consultar y buscar eventos)',
            googleAccessState.hasGmailWrite
              ? 'Redaccion y respuesta de correos via Gmail en modo borrador'
              : 'Gmail conectado solo en lectura (solo leer correos)',
          ]
        : [
            'Google Calendar no conectado actualmente',
            'Gmail no conectado actualmente',
          ]),
    ];

    const finalSystemInstruction = buildSystemPrompt(activeStyleId, {
      currentDateTime: new Date().toLocaleString(langCode, {
        timeZone: clientTimeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      userName: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Usuario',
      timezone: clientTimeZone,
      todayEvents: todayEventsSummary,
      capabilities,
      extraInstructions: [
        `IDIOMA: ${langInstruction}`,
        'Si usas una herramienta, devuelve SOLO el JSON de la herramienta y nada mas.',
        'Si el usuario pregunta por la hora actual en una ciudad o pais, devuelve SOLO {"tool":"getCurrentTime","location":"City or Country"}.',
        'Si el usuario pregunta si puedes hablar en otro idioma, la respuesta es si.',
        'Nunca afirmes que Google ya tiene permiso de escritura solo porque el usuario lo diga. Solo puedes afirmarlo si el estado real del servidor lo confirma en este turno.',
        ...(normalizedAttachments.length > 0
          ? [
              `El usuario adjunto ${normalizedAttachments.length} archivo(s). Debes analizarlos antes de responder.`,
              'Si hay archivos adjuntos, entrega una respuesta completa: resumen, hallazgos clave, detalles relevantes, riesgos o dudas, y siguientes pasos utiles.',
              'No des una respuesta superficial ni ignores archivos adjuntos aunque el mensaje del usuario sea corto.',
            ]
          : []),
        ...(calendarToolsInstruction ? [calendarToolsInstruction] : []),
        ...(gmailToolsInstruction ? [gmailToolsInstruction] : []),
        `El estilo activo es ${activeStyleId}. Mantente fiel a ese estilo sin comentarlo.`,
      ],
    });

    // Call Gemini API with selected model
    console.log("🔄 Calling Gemini API...");
    console.log("🔄 Model:", modelSelection.model);
    console.log("🔄 Contents:", message.substring(0, 100));

    let response;
    try {
      const primaryModel = modelSelection.model;

      console.log(`🔄 Attempting Gemini call with: ${primaryModel}`);
      const userParts: Array<any> = [{ text: message }];
      for (const attachment of normalizedAttachments) {
        userParts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }

      const contents = [
        ...(Array.isArray(history)
          ? history
              .filter((entry: any) => entry?.content)
              .map((entry: any) => ({
                role: entry.role === 'model' ? 'model' : 'user',
                parts: [{ text: entry.content }],
              }))
          : []),
        {
          role: 'user',
          parts: userParts,
        },
      ];

      response = await ai.models.generateContent({
        model: primaryModel,
        contents,
        config: {
          systemInstruction: finalSystemInstruction,
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
        let trimmedText = extractToolPayload(responseText) || '';
        if (!trimmedText) {
          const extractedToolCall = await extractToolCallFromMessage(ai, message, langCode, !!userTokens);
          if (extractedToolCall) {
            trimmedText = extractedToolCall;
            console.log("Fallback extracted tool call:", trimmedText);
          }
        }

        if (trimmedText) {
          console.log("🔧 Detected function call, parsing...");
          const functionCall = JSON.parse(trimmedText);

          if (functionCall.tool) {
            console.log("   Tool:", functionCall.tool);

            if (functionCall.tool === 'getCurrentTime') {
              responseText = getLocalizedCurrentTimeResponse(functionCall.location || '', langCode);
              res.json({ text: responseText });
              return;
            }

            // Get user tokens from Supabase
            const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
            const { data: tokenData } = await supabaseAdmin
              .from('user_google_tokens')
              .select('tokens')
              .eq('user_id', userId)
              .single();

            if (!userTokens) {
              responseText = "Necesitas conectar tu cuenta de Google primero para usar el calendario. Ve a la sección de Calendario para conectarla.";
            } else {
              // Execute the appropriate function
              if (functionCall.tool === 'createCalendarEvent') {
                try {
                const dateInfo = parseNaturalDate(functionCall.dateText, { language: langCode });
                if (!dateInfo) {
                  responseText = "No pude entender la fecha. Por favor, sé más específico (ej: 'mañana a las 3pm' o 'el lunes que viene').";
                } else {
                  const endDate =
                    dateInfo.end ||
                    new Date(dateInfo.start.getTime() + activeStyle.calendarRules.defaultEventDuration * 60 * 1000);

                  const eventData: CalendarEventData = {
                    summary: functionCall.summary,
                    description: functionCall.description,
                    startDate: dateInfo.start,
                    endDate: endDate,
                    isAllDay: dateInfo.isAllDay,
                  };

                  const createdEvent = await createCalendarEvent(userTokens, eventData);
                  responseText = `✅ Evento creado: "${createdEvent.summary}" para el ${dateInfo.start.toLocaleDateString(langCode)}.`;
                  responseText = formatCalendarCreationResponse(activeStyleId, langCode, createdEvent.summary, dateInfo.start, createdEvent.htmlLink);
                  console.log("   Created event:", createdEvent.id);
                }
                } catch (calendarError: any) {
                  console.error("   Error creating calendar event:", calendarError.message);
                  responseText = getCalendarToolErrorMessage(calendarError, langCode);
                }
              } else if (functionCall.tool === 'listCalendarEvents') {
                const dateInfo = parseNaturalDate(functionCall.dateText, { language: langCode });
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
                try {
                await deleteCalendarEvent(userTokens, functionCall.eventId);
                responseText = "✅ Evento eliminado correctamente.";
                responseText = formatCalendarDeleteResponse(activeStyleId);
                } catch (calendarError: any) {
                  console.error("   Error deleting calendar event:", calendarError.message);
                  responseText = getCalendarToolErrorMessage(calendarError, langCode);
                }
              } else if (functionCall.tool === 'updateCalendarEvent') {
                try {
                  const updates: Partial<CalendarEventData> = {};
                if (functionCall.summary) updates.summary = functionCall.summary;
                if (functionCall.description) updates.description = functionCall.description;
                if (functionCall.dateText) {
                  const dateInfo = parseNaturalDate(functionCall.dateText, { language: langCode });
                  if (dateInfo) {
                    updates.startDate = dateInfo.start;
                    updates.endDate = dateInfo.end || new Date(dateInfo.start.getTime() + activeStyle.calendarRules.defaultEventDuration * 60 * 1000);
                    updates.isAllDay = dateInfo.isAllDay;
                  }
                }

                const updatedEvent = await updateCalendarEvent(userTokens, functionCall.eventId, updates);
                responseText = formatCalendarUpdateResponse(activeStyleId, updatedEvent.summary);
                responseText = `✅ Evento actualizado: "${updatedEvent.summary}".`;
                } catch (calendarError: any) {
                  console.error("   Error updating calendar event:", calendarError.message);
                  responseText = getCalendarToolErrorMessage(calendarError, langCode);
                }
              }
              // GMAIL TOOLS EXECUTION
              else if (functionCall.tool === 'readGmailMessage') {
                try {
                  console.log("   Reading Gmail message:", functionCall.messageId);
                  const oauth2Client = getOAuth2Client();
                  oauth2Client.setCredentials(userTokens);
                  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                  const message = await gmail.users.messages.get({
                    userId: 'me',
                    id: functionCall.messageId,
                    format: 'full'
                  });

                  const headers = message.data.payload?.headers || [];
                  const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                  const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
                  const date = headers.find(h => h.name === 'Date')?.value || '';
                  const bodyText = extractBody(message.data.payload);

                  responseText = `📧 Email de: ${from}\nAsunto: ${subject}\nFecha: ${date}\n\n${bodyText.substring(0, 500)}${bodyText.length > 500 ? '...' : ''}`;
                  console.log("   Message read successfully");
                } catch (error: any) {
                  console.error("   Error reading message:", error.message);
                  responseText = "No pude leer ese email. Asegúrate de que el ID sea correcto.";
                }
              }
              else if (functionCall.tool === 'createGmailDraft') {
                try {
                  console.log("   Creating Gmail draft...");
                  const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail');
                  const oauth2Client = getOAuth2Client();
                  oauth2Client.setCredentials(writableTokens);
                  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                  const raw = createEmailMessage(
                    functionCall.to,
                    functionCall.subject,
                    functionCall.body,
                    functionCall.inReplyTo,
                    functionCall.threadId
                  );

                  const draft = await gmail.users.drafts.create({
                    userId: 'me',
                    requestBody: {
                      message: { raw }
                    }
                  });

                  responseText = `📝 Borrador creado exitosamente.\nPara: ${functionCall.to}\nAsunto: ${functionCall.subject}\n\nEl borrador está guardado. ¿Quieres que lo envíe o prefieres revisarlo primero?`;
                  responseText = formatDraftCreatedResponse(activeStyleId, functionCall.to, functionCall.subject);
                  console.log("   Draft created:", draft.data.id);
                } catch (error: any) {
                  console.error("   Error creating draft:", error.message);
                  responseText = isGoogleScopeError(error)
                    ? "Necesito permiso de escritura en Gmail para crear ese borrador. Reconecta Google desde Perfil e intentalo de nuevo."
                    : "No pude crear el borrador. Verifica los datos e intenta de nuevo.";
                }
              }
              else if (functionCall.tool === 'listGmailDrafts') {
                try {
                  console.log("   Listing Gmail drafts...");
                  const oauth2Client = getOAuth2Client();
                  oauth2Client.setCredentials(userTokens);
                  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                  const response = await gmail.users.drafts.list({
                    userId: 'me',
                    maxResults: 10
                  });

                  if (!response.data.drafts || response.data.drafts.length === 0) {
                    responseText = "📋 No tienes borradores guardados.";
                  } else {
                    const draftsList = response.data.drafts.map((d: any, i: number) =>
                      `${i + 1}. ID: ${d.id}`
                    ).join('\n');
                    responseText = `📋 Borradores existentes:\n${draftsList}\n\n¿Quieres que envíe, edite o elimine alguno?`;
                  }
                } catch (error: any) {
                  console.error("   Error listing drafts:", error.message);
                  responseText = "No pude listar los borradores. Intenta de nuevo.";
                }
              }
              else if (functionCall.tool === 'deleteGmailDraft') {
                try {
                  console.log("   Deleting Gmail draft:", functionCall.draftId);
                  const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail');
                  const oauth2Client = getOAuth2Client();
                  oauth2Client.setCredentials(writableTokens);
                  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                  await gmail.users.drafts.delete({
                    userId: 'me',
                    id: functionCall.draftId
                  });

                  responseText = `🗑️ Borrador eliminado exitosamente.`;
                  console.log("   Draft deleted");
                } catch (error: any) {
                  console.error("   Error deleting draft:", error.message);
                  responseText = isGoogleScopeError(error)
                    ? "Necesito permiso de escritura en Gmail para eliminar ese borrador. Reconecta Google desde Perfil e intentalo de nuevo."
                    : "No pude eliminar el borrador. Verifica el ID e intenta de nuevo.";
                }
              }
              else if (functionCall.tool === 'sendGmailDraft') {
                // CRITICAL: Require explicit confirmation
                if (!functionCall.confirmSend) {
                  responseText = "⚠️ Para enviar el borrador necesito tu confirmación explícita. Por favor di 'sí, envía el borrador' o 'confirmo que quiero enviar este email'.";
                  console.log("   Send rejected - no confirmation");
                } else {
                  try {
                    console.log("   Sending Gmail draft:", functionCall.draftId);
                    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail');
                    const oauth2Client = getOAuth2Client();
                    oauth2Client.setCredentials(writableTokens);
                    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                    const sent = await gmail.users.drafts.send({
                      userId: 'me',
                      requestBody: {
                        id: functionCall.draftId
                      }
                    });

                    // Delete draft after sending
                    await gmail.users.drafts.delete({
                      userId: 'me',
                      id: functionCall.draftId
                    }).catch(() => {});

                    responseText = `🚀 Email enviado exitosamente.`;
                    console.log("   Email sent:", sent.data.id);
                  } catch (error: any) {
                    console.error("   Error sending draft:", error.message);
                    responseText = isGoogleScopeError(error)
                      ? "Necesito permiso de escritura en Gmail para enviar ese borrador. Reconecta Google desde Perfil e intentalo de nuevo."
                      : "No pude enviar el email. Verifica el borrador e intenta de nuevo.";
                  }
                }
              }
            }
          }
        }
      } catch (functionError: any) {
        console.error("❌ Function call error:", functionError.message);
        responseText = "Hubo un problema al procesar tu solicitud. Por favor, intenta de nuevo.";
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

    console.error("═══════════�����═══════════════════════════════");

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
    const needsReconnect = isGoogleScopeError(error);

    return res.status(403).json({
      error: `${serviceName}_permission_denied`,
      message: needsReconnect
        ? serviceName === 'calendar'
          ? 'Google Calendar needs write permission. Reconnect Google to grant calendar access again.'
          : 'Gmail needs write permission. Reconnect Google to grant compose and send access again.'
        : `Permission denied for ${serviceName}. Please check API is enabled in Google Cloud Console.`,
      errorCode: needsReconnect ? 'RECONNECT_REQUIRED' : 'PERMISSION_DENIED',
      missingScopes: Array.isArray(error?.missingScopes) ? error.missingScopes : undefined
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
    let resolvedTokens = { ...tokens };
    console.log("✅ Successfully fetched tokens from Supabase fallback");

    // Save to session for future requests (cache)
    req.session.tokens = resolvedTokens;
    try {
      await saveSession(req);
    } catch (err: any) {
      console.log("⚠️ Failed to save tokens to session:", err);
    }

    // Set up auto-refresh listener if not already set
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(resolvedTokens);

    // This is the key part: listen for the 'tokens' event which fires when the client refreshes the access token
    oauth2Client.on('tokens', async (newTokens) => {
      console.log("🔄 Google tokens refreshed automatically");
      const updatedTokens = { ...resolvedTokens, ...newTokens };
      resolvedTokens = updatedTokens;

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

    const tokenExpiresSoon =
      !resolvedTokens.access_token ||
      !resolvedTokens.expiry_date ||
      resolvedTokens.expiry_date <= Date.now() + 5 * 60 * 1000;

    if (tokenExpiresSoon && resolvedTokens.refresh_token) {
      try {
        console.log("🔄 Access token missing or expiring soon, forcing refresh...");
        await oauth2Client.getAccessToken();
        resolvedTokens = { ...resolvedTokens, ...oauth2Client.credentials };
        req.session.tokens = resolvedTokens;
        await saveSession(req);

        const encrypted = encrypt(JSON.stringify(resolvedTokens));
        await supabaseAdmin
          .from('user_google_tokens')
          .upsert({
            user_id: user.id,
            tokens: encrypted,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        console.log("✅ Tokens refreshed proactively before API call");
      } catch (refreshError: any) {
        console.error("❌ Failed to refresh access token proactively:", refreshError.message);
      }
    }

    const enrichedTokens = await attachGoogleScopeMetadata(resolvedTokens, req);
    if (googleScopeMetadataChanged(resolvedTokens, enrichedTokens)) {
      resolvedTokens = enrichedTokens;
      await persistGoogleTokens(user.id, resolvedTokens, req);
      console.log("✅ Google scope metadata refreshed in session and Supabase");
    }

    return resolvedTokens;
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

// ---- Gmail Message Full Content Endpoint ----

// Get full message content by ID
app.get("/api/gmail/messages/:id", authenticateSupabaseUser, async (req, res) => {
  console.log("📧 Gmail message details request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const { id } = req.params;
    console.log(`📧 Fetching message ${id}...`);

    const message = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full'
    });

    const headers = message.data.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
    const to = headers.find(h => h.name === 'To')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';

    // Extract body content
    let bodyText = '';
    let bodyHtml = '';

    // Try to get body from parts
    if (message.data.payload?.parts) {
      for (const part of message.data.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    // If no parts, try main body
    if (!bodyText && !bodyHtml && message.data.payload?.body?.data) {
      const decoded = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
      bodyText = decoded;
    }

    // Get attachments info
    const attachments = [];
    if (message.data.payload?.parts) {
      for (const part of message.data.payload.parts) {
        if (part.filename && part.filename.length > 0) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body?.size || 0
          });
        }
      }
    }

    // Get thread ID for conversation context
    const threadId = message.data.threadId || '';

    res.json({
      id,
      threadId,
      subject,
      from,
      to,
      date,
      messageId,
      bodyText,
      bodyHtml: bodyHtml || bodyText, // Fallback to text if no HTML
      snippet: message.data.snippet || '',
      attachments,
      labels: message.data.labelIds || []
    });
  } catch (error: any) {
    console.error("❌ Error fetching Gmail message:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// ---- Gmail Draft Endpoints ----

app.post("/api/gmail/messages/:id/draft-reply-ai", authenticateSupabaseUser, async (req, res) => {
  console.log("📝 Gmail AI draft reply request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    const ai = getGenAI();
    if (!ai) {
      return res.status(503).json({
        error: "AI service unavailable",
        errorCode: "GEMINI_NOT_CONFIGURED"
      });
    }

    const language = typeof req.body?.language === 'string' ? req.body.language : 'en';
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full'
    });

    const headers = messageResponse.data.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const fromHeader = headers.find(h => h.name === 'From')?.value || '';
    const messageIdHeader = headers.find(h => h.name === 'Message-ID')?.value || '';
    const threadId = messageResponse.data.threadId || '';
    const recipientEmail = extractEmailAddress(fromHeader);
    const sourceBody = extractBody(messageResponse.data.payload) || messageResponse.data.snippet || '';
    const safeBodyExcerpt = sourceBody.slice(0, 4000);
    const langInstruction = languageInstructions[language] || languageInstructions.en;

    const draftResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Original sender: ${fromHeader}
Original subject: ${subject}
Original message:
${safeBodyExcerpt}`,
      config: {
        systemInstruction: `${langInstruction}
You write concise and helpful email replies.
Return ONLY valid JSON with this shape: {"subject":"Re: ...","bodyHtml":"<p>...</p>"}.
Do not include markdown fences or extra commentary.`,
        temperature: 0.7,
        maxOutputTokens: 800,
      }
    });

    const payloadText = extractJsonPayload(draftResponse.text || '');
    let draftSubject = `Re: ${subject}`;
    let draftBodyHtml = `<p>${escapeHtml(sourceBody ? 'Gracias por tu mensaje. Te respondo en breve.' : 'Gracias por tu correo.')}</p>`;

    if (payloadText) {
      const parsedPayload = JSON.parse(payloadText);
      if (typeof parsedPayload.subject === 'string' && parsedPayload.subject.trim()) {
        draftSubject = parsedPayload.subject.trim();
      }
      if (typeof parsedPayload.bodyHtml === 'string' && parsedPayload.bodyHtml.trim()) {
        draftBodyHtml = parsedPayload.bodyHtml.trim();
      }
    }

    const raw = createEmailMessage(recipientEmail, draftSubject, draftBodyHtml, messageIdHeader, threadId);
    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw
        }
      }
    });

    return res.json({
      draftId: draft.data.id,
      messageId: draft.data.message?.id,
      threadId: draft.data.message?.threadId,
      to: recipientEmail,
      subject: draftSubject,
      bodyHtml: draftBodyHtml,
    });
  } catch (error: any) {
    console.error("❌ Error creating AI draft reply:", error.message);
    return handleGoogleApiError(error, req, res, 'gmail');
  }
});

// Create a draft (SAFE - does not send)
app.post("/api/gmail/draft", authenticateSupabaseUser, async (req, res) => {
  console.log("📝 Gmail create draft request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  const { to, subject, body, inReplyTo, threadId } = req.body;

  // Validate required fields
  if (!to || !subject || !body) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ['to', 'subject', 'body'],
      errorCode: "MISSING_FIELDS"
    });
  }

  try {
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create raw RFC 2822 message
    const raw = createEmailMessage(to, subject, body, inReplyTo, threadId);

    console.log("📝 Creating draft...");
    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw
        }
      }
    });

    console.log(`✅ Draft created: ${draft.data.id}`);
    res.json({
      id: draft.data.id,
      messageId: draft.data.message?.id,
      threadId: draft.data.message?.threadId,
      status: 'draft_created',
      message: 'Borrador creado exitosamente. Revisa y envía cuando estés listo.'
    });
  } catch (error: any) {
    console.error("❌ Error creating draft:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// List all drafts
app.get("/api/gmail/drafts", authenticateSupabaseUser, async (req, res) => {
  console.log("📋 Gmail list drafts request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 20
    });

    const drafts = [];
    if (response.data.drafts) {
      for (const draft of response.data.drafts) {
        // Get full message details for each draft
        const message = await gmail.users.drafts.get({
          userId: 'me',
          id: draft.id!
        });

        const headers = message.data.message?.payload?.headers || [];
        drafts.push({
          draftId: draft.id,
          messageId: message.data.message?.id,
          threadId: message.data.message?.threadId,
          subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
          to: headers.find(h => h.name === 'To')?.value || '',
          from: headers.find(h => h.name === 'From')?.value || '',
          date: headers.find(h => h.name === 'Date')?.value || '',
          snippet: message.data.message?.snippet || ''
        });
      }
    }

    res.json(drafts);
  } catch (error: any) {
    console.error("❌ Error listing drafts:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// Get a specific draft
app.get("/api/gmail/drafts/:id", authenticateSupabaseUser, async (req, res) => {
  console.log("📋 Gmail get draft request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const { id } = req.params;
    const draft = await gmail.users.drafts.get({
      userId: 'me',
      id
    });

    const headers = draft.data.message?.payload?.headers || [];
    const bodyText = extractBody(draft.data.message?.payload);

    res.json({
      draftId: draft.data.id,
      messageId: draft.data.message?.id,
      threadId: draft.data.message?.threadId,
      subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
      to: headers.find(h => h.name === 'To')?.value || '',
      from: headers.find(h => h.name === 'From')?.value || '',
      date: headers.find(h => h.name === 'Date')?.value || '',
      bodyText,
      snippet: draft.data.message?.snippet || ''
    });
  } catch (error: any) {
    console.error("❌ Error getting draft:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// Update a draft
app.put("/api/gmail/drafts/:id", authenticateSupabaseUser, async (req, res) => {
  console.log("✏️ Gmail update draft request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  const { id } = req.params;
  const { to, subject, body, threadId } = req.body;

  try {
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create raw RFC 2822 message
    const raw = createEmailMessage(to, subject, body, null, threadId);

    const updated = await gmail.users.drafts.update({
      userId: 'me',
      id,
      requestBody: {
        id,
        message: {
          raw
        }
      }
    });

    res.json({
      id: updated.data.id,
      messageId: updated.data.message?.id,
      threadId: updated.data.message?.threadId,
      status: 'draft_updated',
      message: 'Borrador actualizado exitosamente.'
    });
  } catch (error: any) {
    console.error("❌ Error updating draft:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// Send a draft (REQUIRES EXPLICIT USER CONFIRMATION)
app.post("/api/gmail/drafts/:id/send", authenticateSupabaseUser, async (req, res) => {
  console.log("🚀 Gmail send draft request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  const { id } = req.params;
  const { confirmSend } = req.body;

  // CRITICAL: Require explicit confirmation
  if (!confirmSend) {
    return res.status(400).json({
      error: "Explicit confirmation required",
      message: "Debes confirmar explícitamente que deseas enviar este email. Incluye { confirmSend: true } en el request.",
      errorCode: "CONFIRMATION_REQUIRED"
    });
  }

  try {
    const writableTokens = await ensureGoogleWriteAccess(userTokens, 'gmail', req);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(writableTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    console.log(`🚀 Sending draft ${id}...`);

    // Send the draft
    const sent = await gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id
      }
    });

    // Optionally delete the draft after sending
    await gmail.users.drafts.delete({
      userId: 'me',
      id
    }).catch(() => {
      // Ignore delete errors
    });

    console.log(`✅ Email sent: ${sent.data.id}`);
    res.json({
      id: sent.data.id,
      threadId: sent.data.threadId,
      status: 'email_sent',
      message: 'Email enviado exitosamente.'
    });
  } catch (error: any) {
    console.error("❌ Error sending draft:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// Delete a draft
app.delete("/api/gmail/drafts/:id", authenticateSupabaseUser, async (req, res) => {
  console.log("🗑️ Gmail delete draft request received");

  const userTokens = await getUserTokens(req);
  if (!userTokens) {
    return res.status(401).json({
      error: "Unauthorized - No Google tokens found",
      errorCode: "NO_TOKENS"
    });
  }

  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(userTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const { id } = req.params;
    await gmail.users.drafts.delete({
      userId: 'me',
      id
    });

    console.log(`✅ Draft deleted: ${id}`);
    res.json({
      id,
      status: 'draft_deleted',
      message: 'Borrador eliminado exitosamente.'
    });
  } catch (error: any) {
    console.error("❌ Error deleting draft:", error.message);
    await handleGoogleApiError(error, req, res, 'gmail');
  }
});

// Helper function to create RFC 2822 email message
function createEmailMessage(to: string, subject: string, body: string, inReplyTo?: string, threadId?: string): string {
  const lineBreak = '\r\n';

  let headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`
  ];

  // Add In-Reply-To header for threading
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  // Add thread ID header if provided
  if (threadId) {
    headers.push(`X-GM-THREAD-ID: ${threadId}`);
  }

  const message = [
    ...headers,
    '',
    body
  ].join(lineBreak);

  // Base64 encode the message
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper function to extract body from message payload
function extractBody(payload: any): string {
  if (!payload) return '';

  // Try parts first
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }

  // Try main body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  return '';
}

async function startServer() {
  console.log('🚀 Starting server sequence...');

  // Vite middleware for development
  if (!IS_PROD) {
    console.log('🛠️ Registering Vite middleware (DEVELOPMENT MODE)');
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Portability for Hostinger: determine correct static path
    let staticPath: string;
    const possiblePaths = [
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../dist'),
      path.join(__dirname, 'public_html'),
      path.join(__dirname, '../public_html'),
      path.join(process.cwd(), 'dist'),
      path.join(process.cwd(), 'public_html'),
    ];

    // Find first existing path
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        staticPath = p;
        console.log(`✅ Found static folder at: ${p}`);
        break;
      }
    }

    // Fallback to dist with absolute path
    if (!staticPath) {
      staticPath = path.join(process.cwd(), 'dist');
      console.warn(`⚠️  No static folder found, using fallback: ${staticPath}`);
    }

    console.log(`📦 Serving static files from: ${staticPath}`);

    if (!fs.existsSync(staticPath)) {
      console.error(`❌ CRITICAL: Static folder not found at ${staticPath}`);
      console.error(`   Checked paths: ${possiblePaths.join(', ')}`);
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
      const indexPath = path.resolve(staticPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Error: index.html not found. Please run 'npm run build' first.");
      }
    });
  }

  // Simple listen: Express/Node will auto-detect if PORT is a string (socket) or number (TCP)
  try {
    const server = app.listen(PORT as any, () => {
      console.log(`✅ Server successfully bound to ${PORT}`);
      logToFile(`Server started on ${PORT}`);
    });

    server.on('error', (e: any) => {
      console.error(`❌ SERVER LISTEN ERROR:`, e);
      logToFile("LISTEN ERROR", { code: e.code, message: e.message });
    });
  } catch (listenError: any) {
    console.error(`❌ CRITICAL: Failed to start listening:`, listenError);
  }
}

// Global error handlers to prevent silent 503s
process.on('uncaughtException', (err) => {
  const errorMsg = `🔥 UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`;
  console.error(errorMsg);
  logToFile("UNCAUGHT EXCEPTION", { message: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = `🔥 UNHANDLED REJECTION: ${reason}`;
  console.error(errorMsg);
  logToFile("UNHANDLED REJECTION", { reason: String(reason) });
});

console.log('🚀 Finalizing server initialization...');
startServer().catch(err => {
  console.error("🔥 CRITICAL SERVER STARTUP FAILURE:", err);
  logToFile("CRITICAL STARTUP ERROR", { message: err.message, stack: err.stack });
});
