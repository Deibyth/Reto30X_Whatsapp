/**
 * Outbound poller — periodically fetches pending outbound notifications
 * from the backend and sends them via WhatsApp.
 *
 * Waits for WhatsApp connection before sending. If a notification has
 * an audio_url, it downloads and sends the audio message instead of text.
 */

import type { WASocket } from "@whiskeysockets/baileys";
import {
  getPendingOutbound,
  markOutboundSent,
  markOutboundFailed,
  downloadAudio,
} from "../lib/api-client";
import { convertToVoiceNote } from "../lib/audio-converter";
import { setDataConsent } from "../lib/db";
import fs from "node:fs";
import path from "node:path";

const POLL_INTERVAL_MS = 5_000;
const LOG_FILE = path.resolve(process.cwd(), "data", "poller-debug.log");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Format phone to Baileys JID: "+57300123456" -> "57300123456@s.whatsapp.net" */
function toJid(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Start (or restart) polling the backend for pending outbound notifications.
 *
 * If already running, stops the old poller first — this ensures the socket
 * reference stays fresh after Baileys reconnections.
 *
 * @param sock - The active WhatsApp socket
 */
export function startOutboundPoller(sock: WASocket): void {
  if (intervalHandle) {
    log("[outbound-poller] Restarting with fresh socket...");
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  log(
    `[outbound-poller] Started (polling every ${POLL_INTERVAL_MS}ms)`,
  );

  intervalHandle = setInterval(async () => {
    try {
      // Esperar a que Baileys esté autenticado (sock.user se setea después del QR)
      if (!sock.user) {
        log(
          "[outbound-poller] Esperando QR/autenticacion — skipping cycle",
        );
        return;
      }

      const items = await getPendingOutbound(20);

      if (items.length === 0) {
        return;
      }

      log(
        `[outbound-poller] Processing ${items.length} pending notification(s)`,
      );

      for (const item of items) {
        try {
            const jid = toJid(item.phone);
            log(`[outbound-poller] Attempting send to ${jid} (${item.notification_id}) audio=${!!item.audio_url}`);

          // Auto-accept consent — el bot inicio el contacto, no pedir consentimiento al responder
          setDataConsent(jid, "accepted");

          if (item.audio_url) {
            try {
              const audioBytes = await downloadAudio(item.audio_url);
              log(`[outbound-poller] Audio descargado (${audioBytes.length} bytes), convirtiendo a nota de voz...`);
              const oggBytes = await convertToVoiceNote(audioBytes);
              await sock.sendMessage(jid, {
                audio: Buffer.from(oggBytes),
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
              });
              log(
                `[outbound-poller] Nota de voz enviada a ${jid} (${item.notification_id})`,
              );
            } catch (audioErr) {
              // Fallback to text when audio download/conversion/send fails
              log(`[outbound-poller] Audio falló para ${jid}, fallback a texto: ${audioErr instanceof Error ? audioErr.message : String(audioErr)}`);
              await sock.sendMessage(jid, { text: item.content });
              log(
                `[outbound-poller] Text fallback sent to ${jid} (${item.notification_id})`,
              );
            }
          } else {
            // Send text message
            await sock.sendMessage(jid, { text: item.content });
            log(
              `[outbound-poller] Text sent to ${jid} (${item.notification_id})`,
            );
          }

          await markOutboundSent(item.notification_id);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack?.split('\n').slice(0,3).join(' | ') : '';
          log(`[outbound-poller] Failed for ${item.phone}: ${errMsg} | ${errStack}`);
          console.error(
            `[outbound-poller] Failed for ${item.phone}:`,
            err,
          );
          await markOutboundFailed(
            item.notification_id,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    } catch (err) {
      console.error("[outbound-poller] Error in poll cycle:", err);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the outbound poller.
 */
export function stopOutboundPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[outbound-poller] Stopped");
  }
}
