/**
 * Outbound poller — periodically fetches pending outbound notifications
 * from the backend and sends them via WhatsApp.
 *
 * Waits for WhatsApp connection before sending. If a notification has
 * an audio_url, it downloads and sends the audio message instead of text.
 *
 * Handles connection instability with retries and proper socket readiness checks.
 */

import type { WASocket, ConnectionState } from "@whiskeysockets/baileys";
import {
  getPendingOutbound,
  markOutboundSent,
  markOutboundFailed,
  downloadAudio,
} from "../lib/api-client";
import { setDataConsent } from "../lib/db";
import { convertToVoiceNote } from "../lib/audio-converter";
import fs from "node:fs";
import path from "node:path";

const POLL_INTERVAL_MS = 5_000;
const LOG_FILE = path.resolve(process.cwd(), "data", "poller-debug.log");
const MAX_SEND_RETRIES = 3;
const SEND_RETRY_DELAY_MS = 2_000;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Format phone to Baileys JID. Use @s.whatsapp.net for phone-number-based JIDs. */
function toJid(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `${cleaned}@s.whatsapp.net`;
}

/** Check if socket is fully connected and ready to send messages. */
function isSocketReady(sock: WASocket): boolean {
  return !!(
    sock.user &&
    sock.ws?.isOpen
  );
}

/** Sleep utility for retry delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Send message with retries for transient connection errors. */
async function sendWithRetry(
  sock: WASocket,
  jid: string,
  content: Parameters<WASocket["sendMessage"]>[1],
  retries = MAX_SEND_RETRIES
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Verify socket is still ready before each attempt
      if (!isSocketReady(sock)) {
        throw new Error("Socket not ready (disconnected or not authenticated)");
      }

      await sock.sendMessage(jid, content);
      return; // Success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isConnectionError =
        lastError.message.includes("Connection Closed") ||
        lastError.message.includes("not ready") ||
        lastError.message.includes("WebSocket") ||
        lastError.message.includes("Timed out");

      log(
        `[outbound-poller] Send attempt ${attempt}/${retries} failed for ${jid}: ${lastError.message}`,
      );

      if (attempt < retries && isConnectionError) {
        // Wait before retry, but check if socket recovered
        await sleep(SEND_RETRY_DELAY_MS);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("Send failed after retries");
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
      // Check socket readiness — not just authentication
      if (!isSocketReady(sock)) {
        log(
          "[outbound-poller] Socket not ready (user=" +
            !!sock.user +
            ", ws=" +
            (sock.ws?.isOpen ?? "none") +
            ") — skipping cycle",
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
          log(
            `[outbound-poller] Attempting send to ${jid} (${item.notification_id}) audio=${!!item.audio_url}`,
          );

          // Auto-accept consent — el bot inició el contacto, no pedir consentimiento al responder
          setDataConsent(jid, "accepted");

          if (item.audio_url) {
            try {
              const audioBytes = await downloadAudio(item.audio_url);
              log(
                `[outbound-poller] Audio descargado (${audioBytes.length} bytes), convirtiendo a nota de voz (OGG Opus)...`,
              );
              // Convertir MP3 -> OGG Opus para nota de voz nativa (ptt: true)
              const oggBytes = await convertToVoiceNote(audioBytes);
              log(
                `[outbound-poller] Conversión OK (${oggBytes.length} bytes), enviando como nota de voz...`,
              );
              await sendWithRetry(sock, jid, {
                audio: Buffer.from(oggBytes),
                mimetype: "audio/ogg; codecs=opus",
                ptt: true, // nota de voz nativa
              });
              log(
                `[outbound-poller] Nota de voz enviada a ${jid} (${item.notification_id})`,
              );
            } catch (audioErr) {
              // Fallback to text when audio download/convert/send fails
              log(
                `[outbound-poller] Audio falló para ${jid}, fallback a texto: ${audioErr instanceof Error ? audioErr.message : String(audioErr)}`,
              );
              await sendWithRetry(sock, jid, { text: item.content });
              log(
                `[outbound-poller] Text fallback sent to ${jid} (${item.notification_id})`,
              );
            }
          } else {
            // Send text message
            await sendWithRetry(sock, jid, { text: item.content });
            log(
              `[outbound-poller] Text sent to ${jid} (${item.notification_id})`,
            );
          }

          await markOutboundSent(item.notification_id);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : '';
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
