import path from "node:path";
import fs from "node:fs";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { setConnectionState } from "../db";
import { setupHandler } from "./handler";

const AUTH_DIR = path.resolve(process.cwd(), "auth");

const logger = pino({ level: "silent" });

let sock: ReturnType<typeof makeWASocket> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 8;

export function getSock() {
  return sock;
}

function scheduleReconnect(code?: number) {
  if (reconnectTimer) return;

  reconnectAttempts++;

  // Demasiados reintentos — esperar 5 minutos para destrabar rate limiting
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log(
      `[bot] ⏸️ Demasiados reintentos (${reconnectAttempts}). Esperando 5 min...`,
    );
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      reconnectAttempts = 0;
      sock = null;
      await start();
    }, 300_000);
    return;
  }

  // Exponential backoff: 5s, 10s, 20s, 40s, 80s, 160s, 300s
  const baseDelay = code === 440 ? 15000 : 5000;
  const delay = Math.min(
    baseDelay * Math.pow(2, reconnectAttempts - 1),
    300_000,
  );

  console.log(
    `[bot] ⏳ Reconnect #${reconnectAttempts} en ${(delay / 1000).toFixed(1)}s...`,
  );

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    sock = null;
    await start();
  }, delay);
}

export async function start(): Promise<void> {
  // Resetear estado zombie de sesión anterior
  setConnectionState({
    status: "disconnected",
    qr_string: null,
    phone: null,
  });

  // Obtener la versión más reciente del protocolo WhatsApp
  // Baileys 7.x soporta las versiones 2.3000+
  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
    console.log("[bot] Versión protocolo WhatsApp:", version?.join("."));
  } catch (err) {
    console.warn("[bot] No se pudo obtener última versión:", err);
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,  // false evita que WA rechace conexión ANTES del QR
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("creds.update", saveCreds);
  setupHandler(sock);

  // Debug: eventos de Baileys (sin messages.upsert, ya lo loguea handler)
  const eventLog = [
    "messages.update",
    "chats.upsert",
    "contacts.upsert",
  ] as const;
  for (const ev of eventLog) {
    sock.ev.on(ev, (data: unknown) => {
      console.log(
        `[bot] 📡 evento ${ev}:`,
        JSON.stringify(data).slice(0, 150),
      );
    });
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;

    console.log(
      "[bot] 📡 connection.update:",
      JSON.stringify({ connection, isNewLogin, isOnline, hasQr: !!qr, hasError: !!lastDisconnect?.error })
    );

    if (qr) {
      setConnectionState({
        status: "qr",
        qr_string: qr,
        phone: null,
      });
      try {
        const { default: qrcode } = await import("qrcode-terminal");
        qrcode.generate(qr, { small: true });
        console.log(
          "[bot] QR generado — escanea desde el dashboard",
        );
      } catch {
        console.log(
          "[bot] QR (terminal no disponible):",
          qr.slice(0, 20) + "...",
        );
      }
    }

    if (connection === "connecting") {
      setConnectionState({ status: "connecting" });
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      const phone = sock?.user?.id
        ? sock.user.id.split(":")[0]
        : null;
      setConnectionState({
        status: "connected",
        phone,
        qr_string: null,
      });
      console.log("[bot] ✅ Conectado como:", phone);
    }

    if (connection === "close") {
      const err = lastDisconnect?.error as any;
      const code = err?.output?.statusCode;
      const reason = err?.reason;

      console.log(
        "[bot] ❌ Desconectado — code:",
        code,
        "reason:",
        reason,
      );
      if (err) {
        console.log("[bot] 🐛 Error completo:");
        console.log("  message:", err.message);
        console.log("  cause:", err.cause?.message || err.cause);
        console.log("  stack (1st line):", err.stack?.split('\n')[1]?.trim());
        console.log("  output.statusCode:", err.output?.statusCode);
        console.log("  reason:", err.reason);
        console.log("  data:", err.data);
        console.log("  httpStatus:", err.output?.http?.statusCode);
        console.log("  httpBody:", typeof err.output?.http?.body === 'string' ? err.output.http.body.slice(0, 200) : err.output?.http?.body);
      }

      // loggedOut → borrar sesión y parar
      if (
        code === DisconnectReason.loggedOut ||
        reason === "loggedOut"
      ) {
        setConnectionState({
          status: "disconnected",
          qr_string: null,
          phone: null,
        });
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        console.log("[bot] Sesión borrada — esperando nuevo QR");
        return;
      }

      // restartRequired → reconectar ya, sin esperar
      if (code === DisconnectReason.restartRequired) {
        console.log("[bot] 515 restartRequired — reconectando...");
        sock = null;
        await start();
        return;
      }

      scheduleReconnect(code);
    }
  });
}

export async function shutdown(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try {
      await sock.logout();
    } catch {}
    try {
      sock.end(undefined);
    } catch {}
    sock = null;
  }
}
