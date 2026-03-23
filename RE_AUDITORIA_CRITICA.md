# Reporte de Re-Auditoría Crítica - Mima App (23 de Marzo 2026)

Tras una investigación profunda del sistema, se ha identificado por qué la aplicación "sigue sin funcionar" a pesar de los parches documentados.

## 🔴 Hallazgos Críticos (Bloqueadores)

### 1. Desincronización de Base de Datos (Supabase)
La tabla `public.user_preferences` en el proyecto activo (`uviptofywrklizcvofwj`) tiene un esquema incorrecto que no coincide con el código.
- **Esperado**: `user_id`, `onboarding_done`, `voice_id`, `language`.
- **Actual**: `id`, `personality_mode`, `created_at`.
- **Efecto**: El guardado de preferencias falla SIEMPRE, lo que causa un loop infinito en el onboarding y pérdida de configuraciones de idioma/voz.

### 2. Fallos Silenciosos en el Backend
El archivo `server.ts` está configurado para retornar `200 OK` incluso cuando fallan las operaciones de base de datos, enviando una "nota" en el JSON en lugar de un error HTTP.
- **Efecto**: El frontend cree que todo va bien, pero los datos nunca se guardan. Esto dificulta enormemente el debug para el usuario final.

### 3. Configuración Local / Environment
No se encontró un archivo `.env` en la raíz del proyecto local. Si el usuario está intentando ejecutar la aplicación sin este archivo, todos los servicios (Gemini, Supabase, OAuth) fallarán por falta de credenciales.

## 🟡 Hallazgos de Media Prioridad

### 4. Rutas de Assets Inconsistentes
El logo de la aplicación está referenciado de forma inconsistente:
- En `Auth.tsx`: Usa una URL externa de postimg.cc.
- En `server.ts`: Busca en `/assets/logo.jpg`.
- En `dist`: El archivo existe en `dist/assets/logo.jpg`.

### 5. Deuda Técnica en i18n
Aunque `Auth.tsx` ya está traducido (corrigiendo lo que decía `AGENTS.md`), aún hay inconsistencias en el uso de `t('common.you')` vs `t('chat.sender_you')` y otros componentes secundarios que siguen en inglés.

## 🚀 Plan de Acción Inmediato

1.  **Corrección de Esquema**: Ejecutar SQL para reconstruir la tabla `user_preferences` con las columnas correctas en el proyecto activo.
2.  **Visibilidad de Errores**: Modificar `server.ts` para que retorne errores `500` reales cuando falle Supabase, permitiendo que el navegador muestre errores claros en la consola.
3.  **Verificación de Gemini**: Validar que la `GEMINI_API_KEY` sea funcional mediante el endpoint `/api/test/gemini` (en modo dev).
