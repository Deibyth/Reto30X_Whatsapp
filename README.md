# Agente WhatsApp — Bot con IA + Dashboard Local

Agente de WhatsApp que se conecta a un número real vía Baileys (no Meta API, no Twilio) y responde mensajes con un LLM vía OpenRouter. Incluye dashboard local para ver conversaciones, leer historial, intervenir manualmente y togglear cada chat entre modo IA y modo Humano.

## Stack

- **Next.js 16** + React 19 + TypeScript + App Router
- **Tailwind CSS 4**
- **@whiskeysockets/baileys 6.7+** — cliente WhatsApp Web
- **better-sqlite3** — base de datos local (WAL mode)
- **OpenAI SDK** apuntando a OpenRouter
- **pino** — logger (silent)
- **qrcode** + **qrcode-terminal** — QR PNG + ASCII fallback

## Requisitos

- Node.js >= 20.9.0
- npm 10+

## Instalación

```bash
pnpm install
```

## Configuración

1. Copiá `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

3. Instalá dependencias:
   ```bash
   pnpm install
   ```

2. Completá las variables:
   - `LLM_API_KEY`: tu API key (OpenRouter, OpenAI, Groq, etc.)
   - `LLM_MODEL`: modelo a usar (default: `openai/gpt-4o-mini`)
   - `LLM_BASE_URL`: URL del provider (default: `https://openrouter.ai/api/v1`)
   - `MCP_SERVER_URL`: URL del servidor MCP (default: `http://localhost:9000/mcp`)

> 💡 Podés cambiar de provider solo cambiando `LLM_BASE_URL` y `LLM_API_KEY`:
> - **OpenRouter** → `https://openrouter.ai/api/v1`
> - **OpenAI** → `https://api.openai.com/v1`
> - **Groq** → `https://api.groq.com/openai/v1`
> - **Local (Ollama, etc.)** → `http://localhost:11434/v1`

### Advertencia sobre modelos :free

Los modelos con sufijo `:free` (ej. `meta-llama/llama-3.1-8b-instruct:free`) en OpenRouter tienen rate limits de **50 requests/día** sin créditos cargados. En producción real recomiendo `openai/gpt-4o-mini` (~$0.15/millón de tokens).

## Uso

### Terminal 1 — Proceso bot (Baileys)

```bash
pnpm run start:bot
```

- Si no hay sesión guardada en `./auth/`, queda esperando a que escanees el QR desde el dashboard
- En la terminal se imprime el QR ASCII como fallback de debugging
- La sesión se persiste en `./auth/` para reconexiones sin re-escaneo

### Terminal 2 — Dashboard Next.js

```bash
pnpm dev
```

Abrí [localhost:3000](http://localhost:3000).

### Producción (ambos procesos)

```bash
pnpm run start:all
```

### Flujo del dashboard

1. **Pantalla de conexión**: si no hay sesión Baileys, muestra el QR para escanear
2. **Dashboard real**: después del escaneo exitoso, muestra:
   - Header con número conectado + botón "Desconectar"
   - Lista de conversaciones (ordenadas por último mensaje)
   - Panel de conversación con historial
   - Toggle IA / HUMANO por chat
   - Input para responder manualmente en modo HUMANO
   - Botón "Borrar" para eliminar conversación

## Personalizar el System Prompt

Editá `agent/system-prompt.md` con el prompt de TU negocio. El archivo está en Markdown plano, sin sintaxis especial. Se recarga automáticamente sin reiniciar el bot gracias a invalidación por caché con stat.

## Estructura de carpetas

```
├── src/
│   ├── app/              # Next.js App Router + API routes
│   ├── components/       # Componentes React
│   └── lib/
│       ├── baileys/      # Cliente + handler de WhatsApp
│       ├── db.ts         # SQLite helpers
│       ├── llm.ts        # LLM client (provider-agnostic)
│       └── system-prompt.ts
├── scripts/              # Proceso bot (proceso separado)
├── data/                 # SQLite db (runtime, gitignored)
├── auth/                 # Sesión Baileys (runtime, gitignored)
└── .env.local            # Variables de entorno
```

## API Routes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/connection/status` | Estado de conexión + QR PNG |
| POST | `/api/connection/disconnect` | Desconectar y borrar sesión |
| GET | `/api/conversations` | Lista de conversaciones |
| DELETE | `/api/conversations/[id]` | Borrar conversación |
| GET | `/api/messages/[id]` | Mensajes de una conversación |
| POST | `/api/messages/[id]` | Enviar mensaje humano |
| POST | `/api/mode/[id]` | Cambiar modo AI/HUMAN |

## Deploy (EasyPanel / Railway)

Volúmenes persistentes obligatorios: `/app/data` y `/app/auth`.

Sin ellos cada redespliegue pierde conversaciones y obliga a re-escanear el QR.

## Mejoras pendientes (v2)

- [ ] Soporte de imágenes (enviar PNG de productos)
- [x] Function calling con tools de LubriMCP vía MCP SDK
- [ ] Auto-toggle a HUMAN cuando el bot detecta una frase específica
- [ ] WebSocket en lugar de polling
- [ ] Auth básica en Next.js (middleware con basic auth)
- [ ] Soporte de grupos (@g.us)

## Lecciones aprendidas

1. **Code 405** — usar `fetchLatestBaileysVersion()` siempre
2. **Code 440 en loop** — usar `Browsers.macOS('Desktop')`, no browser custom
3. **QR no aparece** — API defensiva: mostrar QR si `qr_string` existe aunque status no sea exactamente 'qr'
4. **ENV undefined en bot** — ES module hoisting: `env-loader.ts` como primer import
5. **Procesos zombies** — Ctrl+C en Windows no siempre mata hijos de tsx
6. **Node 18 default en Nixpacks** — fijar Node 22 con `.nvmrc` + `nixpacks.toml`
