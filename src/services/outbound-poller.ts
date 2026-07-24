/**
 * Outbound poller — periodically fetches pending outbound notifications
 * from the backend and sends them via WhatsApp.
 */

import type { WASocket } from "@whiskeysockets/baileys";
import {
  getPendingOutbound,
  markOutboundSent,
  markOutboundFailed,
} from "../lib/api-client";

const POLL_INTERVAL_MS = 5_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start polling the backend for pending outbound notifications.
 *
 * @param sock - The active WhatsApp socket
 */
export function startOutboundPoller(sock: WASocket): void {
  if (intervalHandle) {
    console.warn("[outbound-poller] Already running, skipping start");
    return;
  }

  console.log(
    `[outbound-poller] Started (polling every ${POLL_INTERVAL_MS}ms)`,
  );

  intervalHandle = setInterval(async () => {
    try {
      const items = await getPendingOutbound(20);

      if (items.length === 0) {
        return;
      }

      console.log(
        `[outbound-poller] Processing ${items.length} pending notification(s)`,
      );

      for (const item of items) {
        try {
          await sock.sendMessage(item.phone, { text: item.content });
          await markOutboundSent(item.notification_id);
          console.log(
            `[outbound-poller] ✅ Sent to ${item.phone} (${item.notification_id})`,
          );
        } catch (err) {
          console.error(
            `[outbound-poller] ❌ Failed for ${item.phone}:`,
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
