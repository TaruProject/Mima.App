# Plan de Implementación - Fix Chat Mima

## Diagnóstico del Problema

Basado en la auditoría del código, he identificado **3 problemas críticos** que impiden que el chat funcione:

### 🔴 Problema #1: Validación de Variables de Entorno
**Archivo:** `server.ts` líneas 44-64

El servidor se cierra inmediatamente si falta CUALQUIER variable de entorno:
```typescript
if (missingVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables');
  process.exit(1);  // ← ESTO MATA EL SERVIDOR
}
```

**Impacto:** Si falta incluso una variable secundaria (como ELEVENLABS_API_KEY), el servidor no inicia.

### 🔴 Problema #2: Modelos Gemini Obsoletos  
**Archivo:** `server.ts` líneas 1217-1238

El código usa modelos 2.5, pero necesitamos verificar que sean los nombres exactos que acepta la API de Google.

### 🔴 Problema #3: Inicialización Strict de Gemini
**Archivo:** `server.ts` líneas 1266-1284

Si Gemini falla al inicializar, el endpoint `/api/chat` retorna 503 sin intentar reinicializar.

---

## Solución Paso a Paso

### Paso 1: Fix Validación de Variables (CRÍTICO)

Cambiar de validación strict a validación con warnings:

```typescript
// ANTES (server.ts línea 59-64):
if (missingVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nServer cannot start. Please check your .env file.');
  process.exit(1);
}

// DESPUÉS:
const criticalVars = ['GEMINI_API_KEY', 'SESSION_SECRET', 'VITE_SUPABASE_URL'];
const missingCritical = missingVars.filter(v => criticalVars.includes(v));

if (missingCritical.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:');
  missingCritical.forEach(varName => console.error(`   - ${varName}`));
  process.exit(1);
}

if (missingVars.length > 0) {
  console.warn('⚠️  WARNING: Some optional variables are missing:');
  missingVars.forEach(varName => console.warn(`   - ${varName}`));
  console.warn('Server will start but some features may not work.');
}
```

### Paso 2: Fix Endpoint de Chat - Manejo de Errores

Modificar `/api/chat` para:
1. Intentar reinicializar Gemini si falló previamente
2. Dar mensajes de error más específicos
3. No depender de `geminiInitError` global

### Paso 3: Crear Endpoint de Diagnóstico Público

Crear `/api/health-detailed` que funcione en producción y muestre:
- Estado de Gemini (inicializado/no inicializado)
- Variables críticas presentes/ausentes
- Último error de inicialización

---

## Archivos a Modificar

1. **server.ts** - Fixes de validación y manejo de errores
2. **package.json** - Asegurar que tsx esté en dependencies (ya está hecho)

---

## Plan de Deploy

### Fase 1: Diagnóstico (5 min)
1. Subir `server.ts` modificado
2. Reiniciar servidor
3. Verificar `/api/health-detailed`

### Fase 2: Verificación (5 min)
1. Probar chat con mensaje simple
2. Verificar logs en `server.log`
3. Si falla, revisar error específico

### Fase 3: Rollback (si es necesario)
Si algo falla, restaurar versión anterior con:
```bash
git checkout HEAD -- server.ts
```

---

## Checklist Pre-Deploy

- [ ] Crear backup de `server.ts` actual
- [ ] Verificar que `.env` tenga todas las variables
- [ ] Tener acceso SSH/File Manager listo
- [ ] Preparar comando para reiniciar servidor

---

## Comandos para Hostinger

```bash
# Backup
cp server.ts server.ts.backup

# Subir nuevo archivo (usar File Manager o scp)
# ... subir server.ts modificado ...

# Reiniciar
pkill -f node
nohup npx tsx server.ts > server.log 2>&1 &

# Verificar
tail -f server.log
```
