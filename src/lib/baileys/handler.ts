import type { WASocket } from "@whiskeysockets/baileys";
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getPendingOutbox,
  markOutboxSent,
  getSessionIdForPhone,
  setSessionIdForPhone,
} from "../db";
import { sendChatMessage } from "../api-client";
import { startOutboundPoller } from "../../services/outbound-poller";

export function setupHandler(sock: WASocket): void {
  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    console.log(
      `[bot] 📨 messages.upsert type=${type} cantidad=${messages.length}`,
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

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption;

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

      // --- Feedback visual: marcar como leído + delay natural ---
      const mensajeRecibidoEn = Date.now();
      const DELAY_MINIMO_MS = 5000;

      try {
        await sock.sendPresenceUpdate("available", remoteJid);
        await sock.readMessages([msg.key]);
        console.log(`[bot] ✅ Mensaje marcado como leído`);
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
          `[bot] 🔗 Llamando backend (session: ${existingSessionId || "nueva"})...`,
        );

        const result = await sendChatMessage(text, existingSessionId ?? undefined);

        // Guardar el session_id para próximos mensajes
        if (result.session_id) {
          setSessionIdForPhone(phone, result.session_id);
          console.log(`[bot] 📝 Session ID: ${result.session_id}`);
        }

        // Persistir respuesta del backend
        const reply = result.reply;
        insertMessage(convo.id, "assistant", reply);

        // Delay para que pasen al menos DELAY_MINIMO_MS desde que llegó el msg
        const transcurrido = Date.now() - mensajeRecibidoEn;
        const esperaRestante = DELAY_MINIMO_MS - transcurrido;
        if (esperaRestante > 0) {
          console.log(
            `[bot] ⏳ Esperando ${esperaRestante}ms adicionales para total ~5s...`,
          );
          await new Promise((r) => setTimeout(r, esperaRestante));
        }

        // Detener indicador antes de enviar
        clearInterval(composingInterval);
        await sock.sendPresenceUpdate("paused", remoteJid).catch(() => {});

        await sock.sendMessage(remoteJid, { text: reply });
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
          await sock.sendMessage(remoteJid, { text: errorMsg });
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
          await sock.sendMessage(jid, { text: item.content });
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
