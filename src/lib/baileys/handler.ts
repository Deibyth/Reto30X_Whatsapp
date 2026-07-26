import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getPendingOutbox,
  markOutboxSent,
  getSessionIdForPhone,
  setSessionIdForPhone,
  getDataConsent,
  setDataConsent,
} from "../db";
import { sendChatMessage, transcribeAudio, downloadAudio } from "../api-client";
import { startOutboundPoller } from "../../services/outbound-poller";
import { convertToVoiceNote } from "../../lib/audio-converter";

/** Check if Baileys socket is connected and ready to send. */
function isSocketReady(sock: WASocket): boolean {
  return !!sock.user && sock.ws?.isOpen;
}

/** Send a message with retry on transient connection errors. */
async function sendWithRetry(
  sock: WASocket,
  jid: string,
  content: { text: string } | { audio: Buffer; mimetype: string; ptt: boolean },
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (!isSocketReady(sock)) {
      lastError = new Error("Socket not ready");
      if (attempt < maxRetries) {
        console.log(`[sendWithRetry] Socket not ready, waiting ${baseDelayMs}ms before retry...`);
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
    }

    try {
      await sock.sendMessage(jid, content);
      return; // Success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;

      // Only retry on transient connection errors
      const isTransient =
        msg.includes("Connection Closed") ||
        msg.includes("not open") ||
        msg.includes("socket closed") ||
        msg.includes("ECONNRESET");

      if (isTransient && attempt < maxRetries) {
        console.log(`[sendWithRetry] Transient error (attempt ${attempt + 1}/${maxRetries + 1}): ${msg}, retrying...`);
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }

      throw lastError; // Non-transient or max retries reached
    }
  }

  throw lastError;
}

/** Send audio message with retry logic — converts MP3 to OGG Opus for native voice note (PTT). */
async function sendAudioWithRetry(
  sock: WASocket,
  jid: string,
  audioBytes: Uint8Array,
): Promise<void> {
  // Convert MP3 -> OGG Opus for WhatsApp voice note
  const oggBytes = await convertToVoiceNote(audioBytes);
  await sendWithRetry(sock, jid, {
    audio: Buffer.from(oggBytes),
    mimetype: "audio/ogg; codecs=opus",
    ptt: true, // native voice note
  });
}

const CONSENT_URL =
  "https://www.colsubsidio.com/transparencia-acceso-informacion/tratamiento-datos-personales";

const CONSENT_REQUEST_MSG = [
  "Antes de continuar, necesito que aceptes nuestra política de tratamiento de datos personales.",
  "",
  `Puedes leerla completa aquí:`,
  CONSENT_URL,
  "",
  "¿Aceptas el tratamiento de tus datos personales?",
  "Responde *Sí* o *No*.",
].join("\n");

const CONSENT_ACCEPTED_MSG =
  "¡Gracias por aceptar! Ahora sí, ¿en qué puedo ayudarte?";

const CONSENT_DECLINED_MSG = [
  "Entendemos tu decisión.",
  "",
  "Sin aceptar la política de tratamiento de datos personales no podemos procesar ni almacenar tu información personal ni brindarte asesoría personalizada.",
  "",
  "Si en algún momento cambias de opinión, escríbenos de nuevo y podremos ayudarte.",
].join("\n");

const CONSENT_DECLINED_REMINDER_MSG = [
  "Previamente indicaste que no aceptas la política de tratamiento de datos personales.",
  "",
  "Sin esta aceptación no podemos procesar tu información.",
  "Si cambias de opinión, escribe *Sí* para aceptar o *No* si mantienes tu decisión.",
].join("\n");

const CONSENT_REASK_MSG =
  "Por favor responde *Sí* si aceptas el tratamiento de datos personales, o *No* si no aceptas.";

function esAfirmativo(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(s[ií]|sip|dale|ok|okey|okay|bueno|vamos|simon|sipo|afirmativo|acepto|de acuerdo|est[aá] bien|claro|yes|yea|yep|seguro|obvio|correcto|sis|dale|dale si|si claro)$/i.test(t);
}

function esNegativo(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(n[ií]|no|nop|nope|nel|nunca|no gracias|negativo|no acepto|non|nah|nao|nolis|ni loco|para nada|jam[aá]s)$/i.test(t);
}

export function setupHandler(sock: WASocket): void {
  sock.ev.on("messages.upsert", async ({ type, messages }) => {
      console.log(
        `[bot] messages.upsert type=${type} cantidad=${messages.length}`,
      );

    // Procesar notify AND append (mensajes acumulados durante desconexión)
    if (type !== "notify" && type !== "append") {
      console.log(`[bot] → ignorado type=${type}`);
      return;
    }

    for (const msg of messages) {
      console.log(
        `[bot] → msg key=${msg.key?.remoteJid} fromMe=${msg.key?.fromMe}`,
      );

      if (msg.key.fromMe) {
        console.log("[bot] → ignorado (fromMe)");
        continue;
      }

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) {
        console.log("[bot] → ignorado (sin remoteJid)");
        continue;
      }
      if (remoteJid.endsWith("@g.us")) {
        console.log("[bot] → ignorado (grupo)");
        continue;
      }
      // Aceptar @s.whatsapp.net (normal) y @lid (nuevo formato WhatsApp)
      const isNormal = remoteJid.endsWith("@s.whatsapp.net");
      const isLid = remoteJid.endsWith("@lid");

      if (!isNormal && !isLid) {
        console.log("[bot] → ignorado (no es chat 1:1):", remoteJid);
        continue;
      }

      let text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption;

      // ─── Audio entrante: descargar y transcribir ─────────────────────
      if (!text && msg.message?.audioMessage) {
        console.log(`[bot] Audio recibido, transcribiendo...`);
        try {
          const audioBytes = await downloadMediaMessage(
            msg as WAMessage,
            "buffer",
            {},
          );
          if (audioBytes && audioBytes instanceof Buffer) {
            const mimeType = msg.message.audioMessage.mimetype || "audio/mpeg";
            const result = await transcribeAudio(
              new Uint8Array(audioBytes),
              mimeType,
            );
            if (result.text) {
              text = result.text;
              console.log(`[bot] Transcripción: "${text}"`);
            } else {
              console.warn(`[bot] Transcripción falló: ${result.error}`);
            }
          }
        } catch (err) {
          console.error("[bot] Error procesando audio:", err);
        }
      }

      if (!text) {
        console.log(
          `[bot] → ignorado (sin texto) tipo=${Object.keys(msg.message || {})}`,
        );
        continue;
      }

      // Usar el remoteJid completo como identificador (incluye @lid si aplica)
      const phone = remoteJid; // ej: "573176529013@s.whatsapp.net" o "114370851926079@lid"
      const name = msg.pushName || undefined;

      const convo = getOrCreateConversation(phone, name);
      console.log(`[bot] ← Mensaje de ${name || phone}: "${text}"`);

      insertMessage(convo.id, "user", text);

      const fresh = getConversationById(convo.id);
      if (!fresh || fresh.mode !== "AI") {
        console.log(`[bot] → modo ${fresh?.mode} — no respondo`);
        return;
      }

      // ─── Consentimiento de datos personales ─────────────────────────────
      const consent = getDataConsent(phone);

      // Ya aceptó → flujo normal
      if (consent?.status === "accepted") {
        console.log(`[bot] Consentimiento aceptado previamente para ${phone}`);
      }

      // Declinó previamente → recordar y permitir cambiar decisión
      else if (consent?.status === "declined") {
        const lower = text.trim().toLowerCase();
        if (esAfirmativo(lower)) {
          console.log(`[bot] Usuario cambió opinión y aceptó consentimiento`);
          setDataConsent(phone, "accepted");
          await sock.sendMessage(remoteJid, { text: CONSENT_ACCEPTED_MSG });
          insertMessage(convo.id, "assistant", CONSENT_ACCEPTED_MSG);
          continue;
        }
        console.log(`[bot] Consentimiento decline previamente para ${phone}`);
        await sock.sendMessage(remoteJid, { text: CONSENT_DECLINED_REMINDER_MSG });
        insertMessage(convo.id, "assistant", CONSENT_DECLINED_REMINDER_MSG);
        continue;
      }

      // Pendiente o sin registro → manejar flujo de consentimiento
      else {
        const lower = text.trim().toLowerCase();
        const alreadyAsked = consent?.status === "pending";

        if (alreadyAsked) {
          if (esAfirmativo(lower)) {
            console.log(`[bot] Usuario ACEPTÓ consentimiento de datos`);
            setDataConsent(phone, "accepted");
            await sock.sendMessage(remoteJid, { text: CONSENT_ACCEPTED_MSG });
            insertMessage(convo.id, "assistant", CONSENT_ACCEPTED_MSG);
            continue;
          } else if (esNegativo(lower)) {
            console.log(`[bot] Usuario RECHAZÓ consentimiento de datos`);
            setDataConsent(phone, "declined");
            await sock.sendMessage(remoteJid, { text: CONSENT_DECLINED_MSG });
            insertMessage(convo.id, "assistant", CONSENT_DECLINED_MSG);
            continue;
          } else {
            console.log(`[bot] Respuesta ambigua durante consentimiento, re-preguntando`);
            await sock.sendMessage(remoteJid, { text: CONSENT_REASK_MSG });
            continue;
          }
        }

        // Primera vez — pedir consentimiento
        console.log(`[bot] Solicitando consentimiento de datos a ${phone}`);
        setDataConsent(phone, "pending");
        await sock.sendMessage(remoteJid, { text: CONSENT_REQUEST_MSG });
        insertMessage(convo.id, "assistant", CONSENT_REQUEST_MSG);
        continue;
      }

      // --- Feedback visual: marcar como leído + delay natural ---
      const mensajeRecibidoEn = Date.now();
      const DELAY_MINIMO_MS = 5000;

      try {
        await sock.sendPresenceUpdate("available", remoteJid);
        await sock.readMessages([msg.key]);
        console.log(`[bot] Mensaje marcado como leído`);
      } catch (err) {
        console.warn("[bot] No se pudo marcar como leído:", err);
      }

      // Indicador "escribiendo..." mientras procesa
      const COMPOSING_INTERVAL_MS = 15_000;
      await sock.sendPresenceUpdate("composing", remoteJid).catch(() => {});
      const composingInterval = setInterval(() => {
        sock.sendPresenceUpdate("composing", remoteJid).catch(() => {});
      }, COMPOSING_INTERVAL_MS);

      try {
        // ─── Conectar con el backend REST ────────────────────────────────
        // Buscar session_id existente para este número
        const existingSessionId = getSessionIdForPhone(phone);
        console.log(
          `[bot] Llamando backend (session: ${existingSessionId || "nueva"})...`,
        );

        const result = await sendChatMessage(text, existingSessionId ?? undefined);

        // Guardar el session_id para próximos mensajes
        if (result.session_id) {
          setSessionIdForPhone(phone, result.session_id);
          console.log(`[bot] Session ID: ${result.session_id}`);
        }

        // Persistir respuesta del backend
        const reply = result.reply;
        insertMessage(convo.id, "assistant", reply);

        // Delay para que pasen al menos DELAY_MINIMO_MS desde que llegó el msg
        const transcurrido = Date.now() - mensajeRecibidoEn;
        const esperaRestante = DELAY_MINIMO_MS - transcurrido;
        if (esperaRestante > 0) {
          console.log(
            `[bot] Esperando ${esperaRestante}ms adicionales para total ~5s...`,
          );
          await new Promise((r) => setTimeout(r, esperaRestante));
        }

        // Detener indicador antes de enviar
        clearInterval(composingInterval);
        await sock.sendPresenceUpdate("paused", remoteJid).catch(() => {});

        // ─── Audio saliente (nota de voz nativa) o texto ──────────────────────
        if (result.audio_url) {
          try {
            const audioBytes = await downloadAudio(result.audio_url);
            console.log(`[bot] Audio descargado (${audioBytes.length} bytes), convirtiendo a nota de voz (OGG Opus)...`);
            // Convertir MP3 -> OGG Opus y enviar como nota de voz nativa (ptt: true)
            await sendAudioWithRetry(sock, remoteJid, audioBytes);
            console.log(`[bot] → Nota de voz enviada a ${name || phone}`);
          } catch (err) {
            console.warn(`[bot] Falló envío de nota de voz tras reintentos, fallback a texto:`, err);
            await sock.sendMessage(remoteJid, { text: reply });
          }
        } else {
          await sendWithRetry(sock, remoteJid, { text: reply });
        }
        console.log(`[bot] → Enviado a ${name || phone} (modelo: ${result.model})`);
      } catch (err) {
        clearInterval(composingInterval);
        await sock.sendPresenceUpdate("paused", remoteJid).catch(() => {});
        console.error("[bot] Error llamando al backend:", err);

        // Enviar mensaje de error amigable al usuario
        const errorMsg =
          "Lo siento, estoy teniendo problemas para conectarme en este momento. " +
          "Por favor intentá de nuevo en unos segundos.";
        try {
          await sendWithRetry(sock, remoteJid, { text: errorMsg });
        } catch {}
      }
    }
  });

  setInterval(async () => {
    try {
      const pending = getPendingOutbox(20);
      for (const item of pending) {
        // item.phone ya incluye @s.whatsapp.net o @lid
        const jid = item.phone;
        try {
          await sendWithRetry(sock, jid, { text: item.content });
          markOutboxSent(item.id);
          console.log(`[bot] → Outbox enviado a ${item.phone}`);
        } catch (err) {
          console.error(
            `[bot] Error enviando outbox ${item.id}:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error("[bot] Error en outbox poll:", err);
    }
  }, 2000);

  // Start the proactive outbound poller
  startOutboundPoller(sock);
}
