# 🤖 Reto30X — Agente WhatsApp con IA + Dashboard

<p align="center">
  <b>Bot de WhatsApp inteligente potenciado por IA — Protección360 Colsubsidio</b>
  <br>
  <i>「 Conecta tu número real sin APIs de Meta ni Twilio 」</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white">
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white">
  <br>
  <img src="https://img.shields.io/badge/Baileys-6.7-25D366?style=for-the-badge&logo=whatsapp&logoColor=white">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white">
  <img src="https://img.shields.io/badge/OpenRouter-FF6600?style=for-the-badge&logo=openai&logoColor=white">
</p>

---

## 🏗️ Arquitectura

### Visión General

```mermaid
graph TB
    User[("👤 Afiliado\nWhatsApp")]
    WA["📱 Baileys WebSocket\n@whiskeysockets/baileys"]
    Bot["🤖 Bot Handler\nmessages.upsert"]
    Backend(("⚡ Backend FastAPI\nProtección360"))
    DB[("💾 SQLite Local\nwhatsapp.db")]
    LLM["🧠 OpenRouter\nProvider-agnóstico"]
    Dashboard["📊 Dashboard Next.js\nApp Router + API Routes"]

    User <-->|WhatsApp Web| WA
    WA --> Bot
    Bot --> DB
    Bot -->|HTTP POST /chat| Backend
    Backend -->|OpenAI-compatible| LLM
    Bot -->|Polling 2s| Dashboard

    subgraph "🤖 Bot Process (Baileys)"
        Bot
        WA
    end

    subgraph "📊 Dashboard (Next.js)"
        Dashboard
        DB
    end
```

### 🗺️ Flujo de un Mensaje

```mermaid
sequenceDiagram
    actor U as 👤 Afiliado
    participant WA as 📱 Baileys WS
    participant Bot as 🤖 Handler
    participant DB as 💾 SQLite
    participant API as ⚡ FastAPI
    participant AI as 🧠 LLM

    U->>WA: "Hola, quiero un seguro"
    WA->>Bot: messages.upsert
    Bot->>Bot: 👀 Filtrar: fromMe? grupo? sin texto?
    Bot->>DB: getOrCreateConversation()
    Bot->>DB: insertMessage("user", texto)
    Bot->>Bot: ✅ Marcar como leído
    Bot->>WA: sendPresenceUpdate("composing")
    Bot->>API: POST /chat { message, session_id? }
    API->>AI: chat() — clasificar + responder
    AI-->>API: { reply, session_id }
    API-->>Bot: 200 { reply }
    Bot->>Bot: ⏳ Delay natural ~5s
    Bot->>WA: sendPresenceUpdate("paused")
    Bot->>DB: insertMessage("assistant", reply)
    Bot->>WA: sendMessage(remoteJid, reply)
    WA-->>U: 💬 Respuesta de Anna
```

### 🔄 Ciclo de Conexión

```mermaid
stateDiagram-v2
    direction LR
    [*] --> iniciando: 🚀 Arranque
    iniciando --> esperando_qr: 📸 Sin sesión guardada
    esperando_qr --> conectando: 📱 QR escaneado
    conectando --> conectado: ✅ Handshake exitoso
    conectado --> reconectando: ⚠️ Pérdida de conexión
    reconectando --> conectado: ✅ Reconexión exitosa
    reconectando --> esperando_qr: 🔴 Sesión expirada
    conectado --> [*]: 🔌 Desconexión manual

    note right of conectado: 🤖 Bot operativo<br/>respondiendo mensajes
    note right of reconectando: 🔄 Mantiene sesión<br/>sin re-escaneo
```

---

## 🚀 Instalación

### 📦 Requisitos

| Recurso | Versión | Comando |
|---------|:-------:|---------|
| 📦 pnpm | 9+ | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| 📜 Node.js | >= 20.9 | `node --version` |

### 🔑 Variables de Entorno

```bash
cp .env.example .env.local
# ✏️ Edita .env.local y pon tu API key
```

| Variable | ¿Obligatoria? | Defecto | Descripción |
|----------|:-------------:|:-------:|-------------|
| `LLM_API_KEY` | ✅ Sí | — | 🔑 API key del provider (OpenRouter, OpenAI, Groq...) |
| `LLM_MODEL` | ❌ No | `openai/gpt-4o-mini` | 🧠 Modelo LLM a usar |
| `LLM_BASE_URL` | ❌ No | `https://openrouter.ai/api/v1` | 🔗 Endpoint del provider |
| `BACKEND_API_URL` | ❌ No | `http://localhost:8000` | ⚡ URL del backend FastAPI |
| `MCP_SERVER_URL` | ❌ No | `http://localhost:9000/mcp` | 🔌 URL del servidor MCP |

> 🔌 **Provider-agnóstico:** Funciona con **cualquier** proveedor OpenAI-compatible:
> ```bash
> # OpenRouter (default) → LLM_API_KEY=sk-...   + LLM_BASE_URL=https://openrouter.ai/api/v1
> # OpenAI              → LLM_API_KEY=sk-...    + LLM_BASE_URL=https://api.openai.com/v1
> # Groq                → LLM_API_KEY=gsk_...   + LLM_BASE_URL=https://api.groq.com/openai/v1
> # Ollama (local)      → LLM_API_KEY=ollama    + LLM_BASE_URL=http://localhost:11434/v1
> ```

> ⚠️ Los modelos con sufijo `:free` en OpenRouter tienen rate limits de **50 requests/día** sin créditos. En producción recomiendo `openai/gpt-4o-mini`.

### 🤖 Iniciar el Bot

```bash
# Terminal 1 — Bot WhatsApp (Baileys)
pnpm run start:bot

# Terminal 2 — Dashboard Next.js
pnpm dev

# Producción (ambos juntos)
pnpm run start:all
```

### 📋 Flujo de Conexión

1. **📸 Escaneá el QR** desde el dashboard (http://localhost:3000)
2. **✅ Sesión persistida** en `./auth/` — reconexiones sin re-escaneo
3. **📊 Dashboard** con lista de chats, historial y toggle IA/HUMANO
4. **💬 Respondé** mensajes manualmente en modo HUMANO

---

## 📁 Estructura del Proyecto

```
📦 Reto30X_Whatsapp/
├── 📁 src/
│   ├── 📁 app/                    # Next.js App Router + API Routes
│   │   ├── 📁 api/
│   │   │   ├── 📁 connection/     # GET status + POST disconnect
│   │   │   ├── 📁 conversations/  # GET list + DELETE by id
│   │   │   ├── 📁 messages/       # GET history + POST send
│   │   │   └── 📁 mode/           # POST toggle AI/HUMAN
│   │   ├── 📄 globals.css
│   │   ├── 📄 layout.tsx
│   │   └── 📄 page.tsx            # Dashboard principal
│   ├── 📁 components/
│   │   ├── 📄 ConnectionGate.tsx   # 🚪 Pantalla de QR / estado
│   │   ├── 📄 QRScreen.tsx         # 📸 Render de QR
│   │   ├── 📄 ConversationList.tsx # 💬 Lista de chats
│   │   ├── 📄 ConversationPanel.tsx# 🗪 Panel de conversación
│   │   ├── 📄 DashboardHeader.tsx  # 🏠 Header con info de conexión
│   │   ├── 📄 MessageBubble.tsx    # 🫧 Burbuja de mensaje
│   │   └── 📄 ModeToggle.tsx       # 🔄 Toggle IA / HUMANO
│   └── 📁 lib/
│       ├── 📁 baileys/
│       │   ├── 📄 client.ts        # 🔌 Cliente WebSocket Baileys
│       │   └── 📄 handler.ts       # 🤖 Manejador de mensajes
│       ├── 📄 api-client.ts        # 🌐 HTTP client para backend FastAPI
│       ├── 📄 db.ts                # 🗄️ SQLite helpers (better-sqlite3)
│       └── 📄 system-prompt.ts     # 📝 Carga del prompt de sistema
├── 📁 services/
│   └── 📄 outbound-poller.ts       # 📤 Poller de mensajes outbound (proactivo)
├── 📁 scripts/
│   ├── 📄 env-loader.ts            # 🔧 Carga de .env.local
│   └── 📄 start-bot.ts             # 🚀 Entry point del bot
├── 📁 agent/
│   └── 📄 system-prompt.md         # 🧠 Prompt de IA (editá este!)
├── 📁 data/                        # 💾 SQLite DB (runtime, gitignored)
├── 📁 auth/                        # 🔐 Sesión Baileys (runtime, gitignored)
├── 📄 .env.example
├── 📄 .gitignore
├── 📄 next.config.ts
├── 📄 package.json
├── 📄 pnpm-lock.yaml
├── 📄 tsconfig.json
├── 📄 postcss.config.mjs
├── 📄 Procfile
└── 📄 README.md
```

---

## 🌐 API Routes

| Método | 🔗 Ruta | 📝 Descripción |
|:------:|:--------|:---------------|
| <span style="color:green">**GET**</span> | `/api/connection/status` | 📸 Estado de conexión + QR PNG |
| <span style="color:orange">**POST**</span> | `/api/connection/disconnect` | 🔌 Desconectar y borrar sesión |
| <span style="color:green">**GET**</span> | `/api/conversations` | 💬 Lista de conversaciones |
| <span style="color:red">**DELETE**</span> | `/api/conversations/[id]` | 🗑️ Borrar conversación |
| <span style="color:green">**GET**</span> | `/api/messages/[id]` | 📜 Mensajes de una conversación |
| <span style="color:orange">**POST**</span> | `/api/messages/[id]` | ✏️ Enviar mensaje como humano |
| <span style="color:orange">**POST**</span> | `/api/mode/[id]` | 🔄 Cambiar modo AI/HUMAN |

### 💬 POST /chat (al backend FastAPI)

```json
{
  "message": "Quiero asegurar mi moto"
}
```

**✨ Respuesta:**

```json
{
  "reply": "¡Claro! Cuéntame, ¿qué marca y modelo es tu moto?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "model": "gpt-4o-mini",
  "timestamp": "2026-07-23T12:00:00Z"
}
```

> 💡 **Tip:** Si no envías `session_id`, el backend crea una sesión nueva automáticamente.

---

## 📬 Mensajería Outbound (Proactiva)

El bot soporta **mensajería outbound proactiva** — el backend selecciona afiliados elegibles y genera mensajes personalizados por IA que el bot envía automáticamente.

### 🔄 Flujo Outbound

```mermaid
sequenceDiagram
    participant S as ⏰ APScheduler
    participant OS as OutboundService
    participant DB as 🗄️ Backend DB
    participant AI as 🧠 LLM
    participant Bot as 🤖 WhatsApp Bot
    participant U as 👤 Afiliado

    loop Cada 15 minutos
        S->>OS: select_prospects(limit=50)
        OS->>DB: 📊 Query elegibles (score, contrato, ingresos)
        DB-->>OS: Lista de prospects
        OS->>AI: generate_message(prospect)
        AI-->>OS: Mensaje personalizado
        OS->>DB: create_notification(estado="pendiente")
    end

    loop Cada 5 segundos (Poller)
        Bot->>DB: GET /outbound/pending
        DB-->>Bot: [notifications]
        Bot->>U: 📤 sendMessage()
        Bot->>DB: POST /{id}/sent
    end

    alt Sin respuesta en 5 días
        S->>OS: process_reattempts()
        OS->>DB: nuevo Notification(estado="reintento")
        Bot->>U: 🔄 Re-intento
    end
```

### 📡 Endpoints Outbound

| Método | 🔗 Ruta | 📝 Descripción |
|:------:|:--------|:---------------|
| <span style="color:green">**GET**</span> | `/outbound/pending` | 📬 Notificaciones pendientes de enviar |
| <span style="color:orange">**POST**</span> | `/outbound/{id}/sent` | ✅ Marcar como enviada |
| <span style="color:orange">**POST**</span> | `/outbound/{id}/responded` | 💬 Marcar como respondida |
| <span style="color:orange">**POST**</span> | `/outbound/{id}/failed` | ❌ Marcar como fallida |

---

## 🧪 Testing

```bash
# 🚀 Suite completa (331 tests)
python -m pytest

# 🎯 Tests del bot
pnpm run test        # (si aplica)

# 📊 Backend completo
cd ../Reto30X_Credit
python -m pytest backend/tests/ -v
```

---

## 🎯 Personalizar el System Prompt

Editá `agent/system-prompt.md` — es Markdown plano, sin sintaxis especial. Se recarga automáticamente sin reiniciar el bot.

---

## 🐳 Deploy (EasyPanel / Railway)

Volúmenes persistentes obligatorios:

| Volumen | Ruta | ¿Por qué? |
|:-------:|:----:|:----------|
| 📁 `data` | `/app/data` | 💾 No perder conversaciones al redesplegar |
| 📁 `auth` | `/app/auth` | 🔐 No obligar a re-escanear QR |

> ⚠️ Sin volúmenes persistentes, cada redespliegue pierde conversaciones y obliga a re-escanear el QR.

---

## 💡 Lecciones Aprendidas

| # | 🐛 Problema | ✅ Solución |
|:-:|:-----------|:------------|
| 1 | **Code 405** al conectar | Usar `fetchLatestBaileysVersion()` siempre |
| 2 | **Code 440 en loop** | Usar `Browsers.macOS('Desktop')`, no browser custom |
| 3 | **QR no aparece** | Mostrar QR si `qr_string` existe, aunque status no sea exactamente `'qr'` |
| 4 | **ENV undefined en bot** | ES module hoisting: `env-loader.ts` como primer import |
| 5 | **Procesos zombies** | Ctrl+C en Windows no mata hijos de `tsx` |
| 6 | **Node 18 default en Nixpacks** | Fijar Node 22 con `.nvmrc` + `nixpacks.toml` |

---

## 📄 Licencia

**Colsubsidio** — Uso interno. Distribución no autorizada.

---
