# 📧 IMPLEMENTACIÓN GMAIL - RESPUESTA SEGURA DE EMAILS

**Fecha:** 22 de marzo de 2026  
**Estado:** ✅ COMPLETADO  
**Build:** Exitoso  

---

## 🎯 RESUMEN

Se implementó la funcionalidad completa de Gmail con **seguridad de borradores**, donde:

1. ✅ **NUNCA** se envían emails automáticamente
2. ✅ Todos los emails se crean como **borradores primero**
3. ✅ El usuario debe **confirmar explícitamente** antes de enviar
4. ✅ El usuario puede **revisar, editar o eliminar** borradores

---

## 🔒 SEGURIDAD IMPLEMENTADA

### Flujo Seguro de Envío de Emails

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario: "Responde este email diciendo que estaré allí"  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Mima: Crea borrador (NO envía)                           │
│    {"tool": "createGmailDraft", ...}                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Mima: "He creado un borrador. ¿Quieres que lo envíe?"    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Usuario: "Sí, envíalo" / "Confirma que quieres enviar"   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Mima: Verifica confirmación explícita                    │
│    if (!confirmSend) → RECHAZA                              │
│    if (confirmSend) → ENVÍA                                 │
└─────────────────────────────────────────────────────────────┘
```

### Reglas de Seguridad

1. **NUNCA enviar sin confirmación** - El endpoint `/api/gmail/drafts/:id/send` requiere `confirmSend: true`
2. **Siempre crear borrador primero** - El function calling de Gemini siempre crea borradores
3. **Doble verificación** - Gemini pregunta antes de enviar, usuario confirma explícitamente
4. **Borrador se elimina después de enviar** - Limpieza automática

---

## 📋 ENDPOINTS IMPLEMENTADOS

### 1. `GET /api/gmail/messages/:id` - Leer Email Completo

**Descripción:** Obtiene el contenido completo de un email, incluyendo cuerpo, adjuntos y metadata.

**Request:**
```http
GET /api/gmail/messages/abc123
Authorization: Bearer <supabase_token>
```

**Response:**
```json
{
  "id": "abc123",
  "threadId": "thread456",
  "subject": "Re: Reunión de mañana",
  "from": "juan@ejemplo.com",
  "to": "mi@email.com",
  "date": "2026-03-22T10:30:00Z",
  "messageId": "<message-id-original>",
  "bodyText": "Hola,\n\nTe escribo para confirmar...",
  "bodyHtml": "<p>Hola,</p><p>Te escribo para confirmar...</p>",
  "snippet": "Hola, Te escribo para confirmar...",
  "attachments": [
    {
      "filename": "documento.pdf",
      "mimeType": "application/pdf",
      "size": 102400
    }
  ],
  "labels": ["INBOX", "UNREAD", "IMPORTANT"]
}
```

**Usos:**
- Leer cuerpo completo de emails
- Ver adjuntos
- Obtener metadata para respuestas

---

### 2. `POST /api/gmail/draft` - Crear Borrador (SAFE)

**Descripción:** Crea un borrador de email. **NO ENVÍA** el email, solo lo guarda como borrador.

**Request:**
```http
POST /api/gmail/draft
Authorization: Bearer <supabase_token>
Content-Type: application/json

{
  "to": "juan@ejemplo.com",
  "subject": "Re: Reunión de mañana",
  "body": "<p>Hola Juan,</p><p>Estaré allí. Saludos.</p>",
  "inReplyTo": "<message-id-original>",
  "threadId": "thread456"
}
```

**Response:**
```json
{
  "id": "draft789",
  "messageId": "msg101112",
  "threadId": "thread456",
  "status": "draft_created",
  "message": "Borrador creado exitosamente. Revisa y envía cuando estés listo."
}
```

**Campos:**
- `to` (requerido): Email del destinatario
- `subject` (requerido): Asunto del email
- `body` (requerido): Cuerpo en HTML
- `inReplyTo` (opcional): Message-ID original para threading
- `threadId` (opcional): ID del hilo para mantener conversación

**Seguridad:** Este endpoint **NUNCA** envía el email, solo crea borrador.

---

### 3. `GET /api/gmail/drafts` - Listar Borradores

**Descripción:** Obtiene lista de todos los borradores guardados.

**Request:**
```http
GET /api/gmail/drafts
Authorization: Bearer <supabase_token>
```

**Response:**
```json
[
  {
    "draftId": "draft789",
    "messageId": "msg101112",
    "threadId": "thread456",
    "subject": "Re: Reunión de mañana",
    "to": "juan@ejemplo.com",
    "from": "mi@email.com",
    "date": "2026-03-22T11:00:00Z",
    "snippet": "Hola Juan, Estaré allí. Saludos."
  }
]
```

---

### 4. `GET /api/gmail/drafts/:id` - Obtener Borrador

**Descripción:** Obtiene los detalles completos de un borrador específico.

**Request:**
```http
GET /api/gmail/drafts/draft789
Authorization: Bearer <supabase_token>
```

**Response:**
```json
{
  "draftId": "draft789",
  "messageId": "msg101112",
  "threadId": "thread456",
  "subject": "Re: Reunión de mañana",
  "to": "juan@ejemplo.com",
  "from": "mi@email.com",
  "date": "2026-03-22T11:00:00Z",
  "bodyText": "Hola Juan,\n\nEstaré allí. Saludos.",
  "snippet": "Hola Juan, Estaré allí. Saludos."
}
```

---

### 5. `PUT /api/gmail/drafts/:id` - Actualizar Borrador

**Descripción:** Actualiza el contenido de un borrador existente.

**Request:**
```http
PUT /api/gmail/drafts/draft789
Authorization: Bearer <supabase_token>
Content-Type: application/json

{
  "to": "nuevo@ejemplo.com",
  "subject": "Re: Reunión actualizada",
  "body": "<p>Cuerpo actualizado</p>",
  "threadId": "thread456"
}
```

**Response:**
```json
{
  "id": "draft789",
  "messageId": "msg101112",
  "threadId": "thread456",
  "status": "draft_updated",
  "message": "Borrador actualizado exitosamente."
}
```

---

### 6. `POST /api/gmail/drafts/:id/send` - Enviar Borrador ⚠️

**Descripción:** Envía un borrador. **REQUIERE CONFIRMACIÓN EXPLÍCITA.**

**Request:**
```http
POST /api/gmail/drafts/draft789/send
Authorization: Bearer <supabase_token>
Content-Type: application/json

{
  "confirmSend": true
}
```

**Response (éxito):**
```json
{
  "id": "msg101112",
  "threadId": "thread456",
  "status": "email_sent",
  "message": "Email enviado exitosamente."
}
```

**Response (sin confirmación):**
```json
{
  "error": "Explicit confirmation required",
  "message": "Debes confirmar explícitamente que deseas enviar este email. Incluye { confirmSend: true } en el request.",
  "errorCode": "CONFIRMATION_REQUIRED"
}
```

**⚠️ IMPORTANTE:** 
- El campo `confirmSend: true` es **OBLIGATORIO**
- Sin este campo, el endpoint retorna error 400
- El borrador se elimina automáticamente después de enviar

---

### 7. `DELETE /api/gmail/drafts/:id` - Eliminar Borrador

**Descripción:** Elimina un borrador sin enviarlo.

**Request:**
```http
DELETE /api/gmail/drafts/draft789
Authorization: Bearer <supabase_token>
```

**Response:**
```json
{
  "id": "draft789",
  "status": "draft_deleted",
  "message": "Borrador eliminado exitosamente."
}
```

---

## 🤖 FUNCTION CALLING - GMAIL TOOLS

### Instrucciones para Gemini

El sistema prompt incluye estas instrucciones para Gmail:

```
GMAIL TOOLS (BORRADORES SEGUROS):
Tienes acceso a Gmail del usuario. IMPORTANTE: NUNCA envíes emails automáticamente. 
Siempre crea borradores que el usuario debe revisar y aprobar antes de enviar.

Para leer un email completo:
{"tool": "readGmailMessage", "messageId": "id_del_email"}

Para crear un borrador de respuesta (SAFE - no se envía):
{"tool": "createGmailDraft", "to": "email@ejemplo.com", "subject": "Re: Asunto", "body": "<p>Cuerpo HTML</p>", "inReplyTo": "message-id", "threadId": "thread-id"}

Para ver lista de borradores:
{"tool": "listGmailDrafts"}

Para eliminar un borrador:
{"tool": "deleteGmailDraft", "draftId": "id_del_borrador"}

Para ENVIAR un borrador (SOLO con confirmación explícita):
{"tool": "sendGmailDraft", "draftId": "id_del_borrador", "confirmSend": true}

REGLAS IMPORTANTES:
1. NUNCA envíes emails sin confirmación explícita del usuario
2. Siempre crea borradores primero
3. Cuando el usuario diga "responde este email", crea un borrador y dile que lo revise
4. El borrador se envía SOLO si el usuario dice explícitamente "envía el borrador"
5. Usa HTML simple en el cuerpo (<p>, <br>, <b>, etc.)
6. Para respuestas, usa "Re: " en el asunto y mantén el threadId original
```

### Ejemplo de Flujo Completo

**Usuario:** "Responde este email diciendo que confirmaré mi asistencia"

**Mima (function call):**
```json
{"tool": "createGmailDraft", "to": "juan@ejemplo.com", "subject": "Re: Reunión", "body": "<p>Hola Juan,<br>Confirmo mi asistencia. Saludos.</p>", "inReplyTo": "<original-message-id>"}
```

**Mima (respuesta):** "📝 Borrador creado exitosamente. Para: juan@ejemplo.com, Asunto: Re: Reunión. El borrador está guardado. ¿Quieres que lo envíe o prefieres revisarlo primero?"

**Usuario:** "Sí, envíalo"

**Mima (function call):**
```json
{"tool": "sendGmailDraft", "draftId": "draft789", "confirmSend": true}
```

**Mima (respuesta):** "🚀 Email enviado exitosamente."

---

## 🔧 FUNCIONES HELPER

### `createEmailMessage(to, subject, body, inReplyTo, threadId)`

Crea un mensaje RFC 2822 codificado en base64 para Gmail API.

```typescript
function createEmailMessage(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string,
  threadId?: string
): string {
  const lineBreak = '\r\n';
  
  let headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  if (threadId) {
    headers.push(`X-GM-THREAD-ID: ${threadId}`);
  }

  const message = [...headers, '', body].join(lineBreak);
  
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
```

### `extractBody(payload)`

Extrae el cuerpo de texto/HTML del payload de Gmail API.

```typescript
function extractBody(payload: any): string {
  if (!payload) return '';

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  return '';
}
```

---

## 🧪 TESTING

### Comandos curl para probar

```bash
# 1. Leer email completo
curl -H "Authorization: Bearer <token>" \
  https://me.mima-app.com/api/gmail/messages/<message_id>

# 2. Crear borrador
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@ejemplo.com","subject":"Test","body":"<p>Hola</p>"}' \
  https://me.mima-app.com/api/gmail/draft

# 3. Listar borradores
curl -H "Authorization: Bearer <token>" \
  https://me.mima-app.com/api/gmail/drafts

# 4. Enviar borrador (CON confirmación)
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmSend":true}' \
  https://me.mima-app.com/api/gmail/drafts/<draft_id>/send

# 5. Enviar borrador (SIN confirmación - debe fallar)
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://me.mima-app.com/api/gmail/drafts/<draft_id>/send
# Response: 400 CONFIRMATION_REQUIRED
```

---

## ✅ CHECKLIST DE SEGURIDAD

- [x] Endpoint de envío requiere `confirmSend: true`
- [x] Error 400 si no hay confirmación
- [x] Function calling siempre crea borradores primero
- [x] Gemini pregunta antes de enviar
- [x] Borrador se elimina después de enviar
- [x] Logging de todos los envíos
- [x] Mensajes de error claros
- [x] Documentación de seguridad

---

## 📊 COMPARACIÓN ANTES/DESPUÉS

| Funcionalidad | Antes | Después |
|---------------|-------|---------|
| Leer emails | ✅ Solo metadata | ✅ Cuerpo completo + adjuntos |
| Responder emails | ❌ No disponible | ✅ Borradores seguros |
| Enviar emails | ❌ No disponible | ✅ Con confirmación explícita |
| Gestionar borradores | ❌ No disponible | ✅ CRUD completo |
| Seguridad | N/A | ✅ Doble verificación |

---

## 🚀 DEPLOY

### Variables de Entorno (ya configuradas)
```env
GOOGLE_CLIENT_ID=<tu_client_id>
GOOGLE_CLIENT_SECRET=<tu_secret>
# Gmail API debe estar habilitada en Google Cloud Console
```

### Permisos de OAuth Required
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.modify
```

### Pasos Post-Deploy
1. Verificar que Gmail API está habilitado en Google Cloud Console
2. Re-conectar cuenta de Google (los usuarios necesitan autorizar nuevos scopes)
3. Probar flujo completo de creación y envío de borrador

---

## 📝 NOTAS IMPORTANTES

1. **Los usuarios deben reconectar su cuenta de Google** para obtener los nuevos permisos de Gmail
2. **El cuerpo de los emails usa HTML** - Gemini genera HTML simple
3. **Los borradores se sincronizan con Google** - Se pueden ver en Gmail web/app
4. **El threading se preserva** - Usando `inReplyTo` y `threadId`
5. **Limpieza automática** - Borradores se eliminan después de enviar

---

**IMPLEMENTACIÓN COMPLETADA:** 22 de marzo de 2026  
**ESTADO:** ✅ LISTO PARA PRODUCCIÓN  
**SEGURIDAD:** ✅ BORRADORES SEGUROS IMPLEMENTADOS  

---

**FIN DEL DOCUMENTO DE IMPLEMENTACIÓN**
