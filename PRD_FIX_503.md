# 📋 PRD: Corrección Error 503 y Bugs Críticos - Mima.App

**Documento de Requisitos del Producto (PRD)**  
**Versión:** 1.0  
**Fecha:** 22 de marzo de 2026  
**Estado:** Aprobado para implementación  
**Prioridad:** CRÍTICA  

---

## 🎯 RESUMEN EJECUTIVO

### Problema Principal
La aplicación Mima.App está retornando **error 503** al acceder a la URL `https://me.mima-app.com`, a pesar de tener las variables de entorno configuradas correctamente en Hostinger y los despliegues realizándose sin errores.

### Causa Raíz Identificada
El error 503 es causado por **múltiples problemas en el código del servidor** que impiden la correcta inicialización y serving de la aplicación:

1. **Middleware "Panic" mal configurado** - Retorna 503 prematuramente
2. **Ruta de archivos estáticos incorrecta** - No encuentra `index.html` en producción
3. **Inicialización de Gemini bloqueante** - Errores no manejados correctamente
4. **Detección de ambiente inconsistente** - Confunde development/production

### Objetivo
Corregir **100% de los errores identificados** sin romper funcionalidad existente, garantizando que la aplicación sea completamente funcional post-implementación.

---

## 📊 ALCANCE DEL PROYECTO

### ✅ Incluido en este PRD
- Corrección del error 503 en el servidor
- Fix de 10 bugs identificados en auditoría
- Mejoras de seguridad críticas
- Optimización de manejo de errores
- Mejora de serving de archivos estáticos
- Corrección de CSP headers

### ❌ Fuera de alcance
- Nuevas features
- Cambios de UI/UX
- Refactorización mayor del código
- Migración de dependencias

---

## 🔍 ANÁLISIS TÉCNICO DETALLADO

### 1. Error 503 - Middleware Panic (CRÍTICO)

**Archivo:** `server.ts` líneas 128-138

**Código Problemático:**
```typescript
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
```

**Problema:**
- El middleware solo verifica `req.path === '/'` pero las aplicaciones SPA modernas pueden tener rutas diferentes
- Las variables de entorno SÍ están configuradas en Hostinger, pero el middleware las verifica antes de que dotenv las cargue completamente
- `envErrors` se popula en el inicio del archivo, pero dotenv puede no haber terminado de cargar

**Impacto:** 503 inmediato al acceder a la raíz de la aplicación

---

### 2. Archivos Estáticos - Ruta Incorrecta (CRÍTICO)

**Archivo:** `server.ts` líneas 2007-2018

**Código Problemático:**
```typescript
const staticPath = fs.existsSync(path.join(__dirname, "dist"))
  ? "dist"
  : (fs.existsSync(path.join(__dirname, "public_html")) ? "public_html" : "dist");

console.log(`📦 Serving static files from: ${path.resolve(__dirname, staticPath)}`);

if (!fs.existsSync(path.resolve(__dirname, staticPath))) {
  console.error(`❌ CRITICAL: Static folder '${staticPath}' not found at ${path.resolve(__dirname, staticPath)}`);
}
```

**Problema:**
- En Hostinger con tsx, `__dirname` apunta a la carpeta temporal de compilación, NO al raíz del proyecto
- La ruta relativa `"dist"` se resuelve incorrectamente
- El servidor no encuentra los archivos estáticos y retorna 404/503

**Impacto:** La aplicación frontend nunca carga

---

### 3. Inicialización de Gemini - Error No Manejado (ALTO)

**Archivo:** `server.ts` líneas 1278-1300

**Código Problemático:**
```typescript
function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const errorMsg = "GEMINI_API_KEY is not configured";
      console.error("❌ GEMINI INIT ERROR:", errorMsg);
      geminiInitError = errorMsg;
      throw new Error(errorMsg);
    }
    // ...
  }
  return genAI;
}
```

**Problema:**
- El error se guarda en `geminiInitError` pero también hace throw
- Múltiples endpoints verifican `geminiInitError` y retornan 503
- La inicialización puede fallar incluso con API key válida por problemas de red/timeout

**Impacto:** Chat no funciona, retorna 503

---

### 4. Detección de Ambiente - Lógica Incorrecta (MEDIO)

**Archivo:** `server.ts` líneas 88-92

**Código Problemático:**
```typescript
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.PORT;
if (IS_PROD && process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'production';
}
```

**Problema:**
- Asume que `PORT` siempre significa producción (falso en desarrollo local)
- Sobrescribe `NODE_ENV` lo que puede causar comportamientos inesperados
- CSP y cookies se configuran incorrectamente

**Impacto:** Cookies inseguras, CSP muy restrictivo en desarrollo

---

### 5. Content Security Policy - Headers Conflictivos (MEDIO)

**Archivos:** `server.ts` líneas 145-156 y `dist/.htaccess`

**Problema:**
- Dos fuentes de CSP diferentes (Express + Apache)
- Pueden conflictuar y bloquear scripts legítimos
- El CSP del servidor es más restrictivo que el de `.htaccess`

**Impacto:** Scripts bloqueados, app no funciona

---

### 6. Sesión OAuth - Race Condition (ALTO)

**Archivo:** `server.ts` líneas 191-203

**Código Problemático:**
```typescript
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
```

**Problema:**
- No hay reintentos si falla el guardado
- En OAuth callback, si `saveSession` falla, el usuario pierde la sesión
- No hay fallback si la sesión no se puede guardar

**Impacto:** OAuth falla intermitentemente

---

### 7. Validación de Variables de Entorno - Falsa Negativa (ALTO)

**Archivo:** `server.ts` líneas 44-75

**Código Problemático:**
```typescript
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
const missingCritical = missingVars.filter(v => criticalVars.includes(v));

if (missingCritical.length > 0) {
  const errorMsg = `❌ CRITICAL: Missing required environment variables: ${missingCritical.join(', ')}`;
  envErrors.push(errorMsg);
  console.error(errorMsg);
}
```

**Problema:**
- La validación ocurre INMEDIATAMENTE al importar el módulo
- dotenv puede no haber terminado de cargar el `.env`
- En Hostinger, las variables vienen del entorno, no de `.env`
- `envErrors` se usa para retornar 503 incluso si las variables están disponibles después

**Impacto:** Falso positivo de variables faltantes → 503

---

### 8. Manejo de Errores de Supabase - Sin Fallback (MEDIO)

**Archivo:** `src/services/userPreferencesService.ts`

**Problema:**
- Todos los métodos retornan `null` o `[]` en error
- No hay logging estructurado de errores
- El frontend no sabe si fue error de red o datos vacíos

**Impacto:** Debugging difícil, UX pobre

---

### 9. PWA Icons - Ruta Incorrecta (BAJO)

**Archivo:** `vite.config.ts` líneas 32-43

**Código Problemático:**
```typescript
icons: [
  {
    src: '/assets/logo.jpg',
    sizes: '192x192',
    type: 'image/jpeg'
  },
  // ...
]
```

**Problema:**
- El logo está en `public/` pero la ruta del manifiesto apunta a `/assets/`
- PWA no puede instalarse correctamente

**Impacto:** PWA no instalable

---

### 10. Debug Endpoints - Exposición de Datos (MEDIO)

**Archivos:** Múltiples endpoints `/api/debug/*`

**Problema:**
- Solo protegidos por `NODE_ENV === 'production'`
- Exponen información sensible (API keys parcial, stack traces)
- Sin autenticación requerida

**Impacto:** Riesgo de seguridad

---

## 📋 REQUISITOS FUNCIONALES

### RF1 - Corrección Error 503
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF1.1 | Eliminar middleware "Panic" que retorna 503 prematuramente | CRÍTICA |
| RF1.2 | Mover validación de variables a endpoint de health check | CRÍTICA |
| RF1.3 | Agregar logging estructurado de errores de inicialización | ALTA |

### RF2 - Serving de Archivos Estáticos
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF2.1 | Corregir ruta de archivos estáticos para Hostinger | CRÍTICA |
| RF2.2 | Agregar fallback a `public_html` si `dist` no existe | ALTA |
| RF2.3 | Agregar verificación post-build de archivos | MEDIA |

### RF3 - Inicialización de Gemini
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF3.1 | Separar inicialización de uso (lazy loading) | ALTA |
| RF3.2 | Agregar reintentos con backoff exponencial | ALTA |
| RF3.3 | Retornar error gracefully en lugar de 503 | MEDIA |

### RF4 - Manejo de Ambiente
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF4.1 | Remover asignación automática de `NODE_ENV` | ALTA |
| RF4.2 | Usar variable explícita `IS_HOSTINGER` | MEDIA |
| RF4.3 | Configurar cookies basado en HTTPS real, no ambiente | ALTA |

### RF5 - Content Security Policy
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF5.1 | Unificar CSP en un solo lugar | MEDIA |
| RF5.2 | Remover CSP duplicado de `.htaccess` | BAJA |
| RF5.3 | Agregar nonce para scripts inline | MEDIA |

### RF6 - OAuth Session Management
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF6.1 | Agregar reintentos en `saveSession` | ALTA |
| RF6.2 | Agregar fallback a localStorage si session falla | MEDIA |
| RF6.3 | Mejorar logging de errores de sesión | MEDIA |

### RF7 - Validación de Variables de Entorno
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF7.1 | Mover validación después de dotenv.config() | CRÍTICA |
| RF7.2 | Agregar async/await para carga de variables | ALTA |
| RF7.3 | Crear endpoint `/api/health/env` para debug | MEDIA |

### RF8 - Manejo de Errores de Supabase
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF8.1 | Agregar logging estructurado de errores | MEDIA |
| RF8.2 | Diferenciar entre "sin datos" y "error" | MEDIA |
| RF8.3 | Agregar timeouts a consultas | BAJA |

### RF9 - PWA Configuration
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF9.1 | Corregir ruta de iconos en vite.config.ts | BAJA |
| RF9.2 | Agregar verificación post-build de iconos | BAJA |

### RF10 - Seguridad Debug Endpoints
| ID | Descripción | Prioridad |
|----|-------------|-----------|
| RF10.1 | Remover endpoints de debug en producción | ALTA |
| RF10.2 | Agregar autenticación a endpoints de debug | MEDIA |
| RF10.3 | Enmascarar información sensible en logs | ALTA |

---

## 🏗️ ARQUITECTURA DE SOLUCIÓN

### Diagrama de Flujo - Request Handling (Post-Fix)

```
┌─────────────┐
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  1. Check /api/ping         │ → 200 OK (inmediato, sin checks)
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  2. Check /api/health*      │ → Health check completo
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  3. Static File Request     │ → Servir desde ruta correcta
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  4. API Route               │ → Verificar auth
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  5. Handler Execution       │ → Con retry y fallback
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  6. Response                │ → Con manejo de errores
└─────────────────────────────┘
```

### Cambios en Estructura de Archivos

```
Mima.App/
├── server.ts                    # MODIFICADO
├── src/
│   ├── services/
│   │   └── userPreferencesService.ts  # MODIFICADO
│   └── lib/
│       └── supabase.ts        # MODIFICADO
├── vite.config.ts             # MODIFICADO
└── dist/
    └── .htaccess              # MODIFICADO (eliminar CSP duplicado)
```

---

## 📝 ESPECIFICACIONES DE IMPLEMENTACIÓN

### Fix 1: Eliminar Middleware Panic

**Archivo:** `server.ts`

**Cambios:**
```typescript
// ELIMINAR completamente este bloque (líneas 128-138):
/*
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
*/

// REEMPLAZAR validación inicial con:
let envValidationComplete = false;
let envValidationResult = { valid: false, missing: [] as string[] };

// Validar después de que dotenv haya cargado completamente
setTimeout(() => {
  const requiredVars = ['GEMINI_API_KEY', 'SESSION_SECRET', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missing = requiredVars.filter(v => !process.env[v]);
  envValidationResult = {
    valid: missing.length === 0,
    missing
  };
  envValidationComplete = true;
  console.log('✅ Environment validation complete:', envValidationResult);
}, 100); // Esperar 100ms para que dotenv termine
```

---

### Fix 2: Corregir Ruta de Estáticos

**Archivo:** `server.ts` (líneas 2007-2018)

**Reemplazar:**
```typescript
// Portability for Hostinger: search for static files in dist or public_html
const staticPath = fs.existsSync(path.join(__dirname, "dist"))
  ? "dist"
  : (fs.existsSync(path.join(__dirname, "public_html")) ? "public_html" : "dist");

console.log(`📦 Serving static files from: ${path.resolve(__dirname, staticPath)}`);

if (!fs.existsSync(path.resolve(__dirname, staticPath))) {
  console.error(`❌ CRITICAL: Static folder '${staticPath}' not found at ${path.resolve(__dirname, staticPath)}`);
}
```

**Por:**
```typescript
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
    break;
  }
}

// Fallback to dist with absolute path
if (!staticPath) {
  staticPath = path.join(process.cwd(), 'dist');
}

console.log(`📦 Serving static files from: ${staticPath}`);

if (!fs.existsSync(staticPath)) {
  console.error(`❌ CRITICAL: Static folder not found at ${staticPath}`);
  console.error(`   Checked paths: ${possiblePaths.join(', ')}`);
}
```

---

### Fix 3: Lazy Loading de Gemini

**Archivo:** `server.ts` (líneas 1274-1310)

**Reemplazar:**
```typescript
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
```

**Por:**
```typescript
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
```

---

### Fix 4: Corregir Detección de Ambiente

**Archivo:** `server.ts` (líneas 88-92)

**Reemplazar:**
```typescript
// Determine environment - default to production if PORT is provided (likely hosting)
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.PORT;
if (IS_PROD && process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'production';
}
```

**Por:**
```typescript
// Determine environment explicitly
const IS_HOSTINGER = !!process.env.HOSTINGER_ENV || !!process.env.HOSTINGER;
const IS_PROD = process.env.NODE_ENV === 'production' || IS_HOSTINGER;

// Log environment detection
console.log('🔍 Environment detection:', {
  NODE_ENV: process.env.NODE_ENV,
  IS_HOSTINGER,
  IS_PROD,
  HAS_PORT: !!process.env.PORT
});
```

---

### Fix 5: Unificar CSP Headers

**Archivo:** `server.ts` (líneas 145-156)

**Reemplazar:**
```typescript
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
```

**Por:**
```typescript
// CSP headers - Unified for all environments with proper escapes
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
```

**Archivo:** `dist/.htaccess`

**Eliminar** la sección completa de CSP Header (líneas 24-27 del .htaccess)

---

### Fix 6: Mejorar saveSession con Retry

**Archivo:** `server.ts` (líneas 191-203)

**Reemplazar:**
```typescript
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
```

**Por:**
```typescript
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
```

---

### Fix 7: Mover Validación de Variables

**Archivo:** `server.ts` (líneas 44-75)

**Reemplazar todo el bloque de validación inicial por:**
```typescript
// Environment variables validation - deferred until after dotenv loads
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

// Validate after a short delay to ensure dotenv has loaded
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
```

---

### Fix 8: Mejorar Logging en Supabase Service

**Archivo:** `src/services/userPreferencesService.ts`

**Agregar al inicio del archivo:**
```typescript
// Structured logging helper
function logService(level: 'info' | 'warn' | 'error', operation: string, details?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    service: 'userPreferencesService',
    operation,
    level,
    ...details
  };
  
  if (level === 'error') {
    console.error('[SupabaseService]', JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn('[SupabaseService]', JSON.stringify(logEntry));
  } else {
    console.log('[SupabaseService]', JSON.stringify(logEntry));
  }
}
```

**Reemplazar cada función para usar logging estructurado:**
```typescript
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    logService('info', 'getUserPreferences', { userId });
    
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logService('info', 'getUserPreferences', { userId, result: 'not_found_using_defaults' });
        return {
          user_id: userId,
          onboarding_done: false,
          voice_id: 'DODLEQrClDo8wCz460ld',
          language: 'en',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      logService('error', 'getUserPreferences', { userId, error: error.message, code: error.code });
      return null;
    }

    logService('info', 'getUserPreferences', { userId, result: 'success' });
    return data;
  } catch (error: any) {
    logService('error', 'getUserPreferences', { userId, error: error.message, stack: error.stack });
    return null;
  }
}
```

---

### Fix 9: Corregir PWA Icons

**Archivo:** `vite.config.ts` (líneas 32-43)

**Reemplazar:**
```typescript
VitePWA({
  registerType: 'prompt',
  includeAssets: ['assets/logo.jpg'],
  workbox: {
    // ... existing config
  },
  manifest: {
    name: 'Mima',
    short_name: 'Mima',
    description: 'Your personal AI assistant.',
    theme_color: '#131117',
    background_color: '#131117',
    display: 'standalone',
    icons: [
      {
        src: '/assets/logo.jpg',
        sizes: '192x192',
        type: 'image/jpeg'
      },
      {
        src: '/assets/logo.jpg',
        sizes: '512x512',
        type: 'image/jpeg'
      }
    ]
  },
  // ...
})
```

**Por:**
```typescript
VitePWA({
  registerType: 'prompt',
  includeAssets: ['logo.jpg'],
  workbox: {
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'navigation-cache',
          expiration: {
            maxEntries: 1,
          },
        },
      },
    ],
  },
  manifest: {
    name: 'Mima',
    short_name: 'Mima',
    description: 'Your personal AI assistant.',
    theme_color: '#131117',
    background_color: '#131117',
    display: 'standalone',
    icons: [
      {
        src: '/logo.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any maskable'
      },
      {
        src: '/logo.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any maskable'
      }
    ]
  },
  devOptions: {
    enabled: true,
    type: 'module'
  }
})
```

---

### Fix 10: Remover/Proteger Debug Endpoints

**Archivo:** `server.ts`

**Eliminar completamente los siguientes endpoints en producción:**
- `/api/debug` (líneas ~550)
- `/api/debug/chat` (líneas ~439)
- `/api/debug/last-chat-error` (líneas ~485)
- `/api/debug/env-status` (líneas ~1377)
- `/api/debug/gemini-config` (líneas ~338)
- `/api/debug/gemini` (líneas ~356)
- `/api/oauth/debug` (líneas ~540)

**Reemplazar con:**
```typescript
// Debug endpoints - only available in development
if (process.env.NODE_ENV !== 'production' && !process.env.HOSTINGER) {
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
  
  // ... other debug endpoints
}
```

---

## 🧪 PLAN DE TESTING

### Tests de Regresión

| Test ID | Descripción | Criterio de Éxito |
|---------|-------------|-------------------|
| T1 | Acceder a `/` | 200 OK, HTML carga |
| T2 | Acceder a `/api/ping` | 200 OK, responde "pong" |
| T3 | Acceder a `/api/health` | 200 OK, JSON con status |
| T4 | Acceder a `/api/health-detailed` | 200 OK, Gemini initialized |
| T5 | Login con Supabase | Redirige a `/` |
| T6 | Chat básico | Responde mensaje |
| T7 | OAuth Google | Flujo completo funciona |
| T8 | PWA install | Manifest válido |
| T9 | Assets estáticos | JS/CSS cargan sin 404 |
| T10 | Cookies de sesión | Se crean correctamente |

### Tests de Estrés

| Test ID | Descripción | Criterio de Éxito |
|---------|-------------|-------------------|
| S1 | 100 requests simultáneos | 0 errores 503 |
| S2 | Memory leak test | < 200MB después de 1hr |
| S3 | Gemini retry test | Funciona después de fallo temporal |
| S4 | Session persistence | Sesión sobrevive restart |

---

## 📅 CRONOGRAMA DE IMPLEMENTACIÓN

### Fase 1: Correcciones Críticas (Día 1)
- [ ] Fix 1: Eliminar middleware Panic
- [ ] Fix 2: Corregir ruta de estáticos
- [ ] Fix 7: Mover validación de variables
- [ ] Deploy a staging
- [ ] Tests T1-T4

### Fase 2: Correcciones Altas (Día 2)
- [ ] Fix 3: Lazy loading de Gemini
- [ ] Fix 4: Corregir detección de ambiente
- [ ] Fix 6: Mejorar saveSession
- [ ] Deploy a staging
- [ ] Tests T5-T7

### Fase 3: Correcciones Medias/Bajas (Día 3)
- [ ] Fix 5: Unificar CSP
- [ ] Fix 8: Logging en Supabase
- [ ] Fix 9: Corregir PWA icons
- [ ] Fix 10: Remover debug endpoints
- [ ] Deploy a staging
- [ ] Tests T8-T10

### Fase 4: Producción (Día 4)
- [ ] Deploy a producción
- [ ] Monitoreo de errores
- [ ] Validación de métricas

---

## 📈 MÉTRICAS DE ÉXITO

| Métrica | Antes | Después | Objetivo |
|---------|-------|---------|----------|
| Error 503 rate | >50% | 0% | 0% |
| Tiempo de carga inicial | N/A (falla) | <3s | <2s |
| Gemini success rate | Variable | >99% | >99% |
| OAuth success rate | Variable | >98% | >98% |
| PWA install rate | 0% | >80% | >80% |

---

## 🔒 CONSIDERACIONES DE SEGURIDAD

1. **No exponer variables de entorno** en logs o respuestas
2. **Mantener CSP restrictivo** pero funcional
3. **Validar todos los inputs** de API endpoints
4. **Rate limiting** en endpoints críticos (futuro)
5. **HTTPS forzado** en producción

---

## 📞 PLAN DE COMUNICACIÓN

### Stakeholders a Notificar
- [ ] Equipo de desarrollo
- [ ] QA/Testing
- [ ] DevOps (para deploy)
- [ ] Usuarios finales (si hay downtime)

### Canales de Comunicación
- Slack: #mima-app-updates
- Email: equipo@mima-app.com
- Status page: status.mima-app.com

---

## 🎯 CRITERIOS DE ACEPTACIÓN

### Criterios Técnicos
- [ ] 0 errores 503 en logs de producción
- [ ] 100% de requests retornan 200/201/204
- [ ] Build pasa sin warnings críticos
- [ ] Tests de regresión pasan 100%
- [ ] No hay memory leaks después de 24hr

### Criterios de Negocio
- [ ] Usuarios pueden acceder a la app
- [ ] Chat con Gemini funciona
- [ ] OAuth de Google funciona
- [ ] PWA es instalable
- [ ] Sesiones persisten correctamente

---

## 📋 CHECKLIST PRE-DEPLOY

### Código
- [ ] Todos los fixes implementados
- [ ] Tests locales pasan
- [ ] Build genera sin errores
- [ ] No hay console.log de debug

### Configuración
- [ ] Variables de entorno en Hostinger verificadas
- [ ] Dominio apuntando correctamente
- [ ] SSL certificado válido
- [ ] PM2 configurado correctamente

### Monitoreo
- [ ] Logs habilitados
- [ ] Alertas configuradas
- [ ] Dashboard de métricas listo
- [ ] Runbook de rollback preparado

---

## 🔄 PLAN DE ROLLBACK

Si el deploy falla:

1. **Inmediato:** Revertir a commit anterior en Git
2. **Hostinger:** `pm2 restart mima-app@previous`
3. **Validar:** Verificar que error 503 desapareció
4. **Post-mortem:** Analizar causa de fallo
5. **Re-intentar:** Corregir y re-deploy

---

## 📝 NOTAS ADICIONALES

### Dependencias Críticas
- `@google/genai`: Versión 1.29.0+ requerida
- `express`: Versión 4.21.2+ requerida
- `@supabase/supabase-js`: Versión 2.98.0+ requerida

### Configuración Hostinger Requerida
```
Node.js Version: 18.x o superior
Startup File: index.js (bootstrapper)
PM2: Habilitado
SSL: Forzado
```

### Comandos Útiles
```bash
# Ver logs en tiempo real
pm2 logs mima-app --lines 100

# Reiniciar servidor
pm2 restart mima-app

# Ver status
pm2 status

# Ver variables de entorno
pm2 show mima-app | grep -A 50 "env"
```

---

**FIN DEL DOCUMENTO PRD**
