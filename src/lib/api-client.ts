/**
 * API client para el backend REST de Protección Inteligente 360°.
 *
 * El backend (FastAPI + FastMCP) tiene ToolBridge + ChatService que
 * orquestan el LLM, las tools, y las sesiones. Este cliente es la
 * capa thin que conecta WhatsApp con ese backend.
 */

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "http://localhost:8000";
const TIMEOUT_MS = Number(process.env.BACKEND_API_TIMEOUT_MS) || 60_000;

export type ChatResponse = {
  reply: string;
  session_id: string;
  model: string;
  timestamp: string;
  campos_actualizados?: string[];
  completitud_pct?: number;
};

/**
 * Envía un mensaje al backend y devuelve la respuesta de la IA.
 *
 * @param message - Texto del usuario
 * @param sessionId - ID de sesión existente, o undefined para crear nueva
 * @returns ChatResponse con la respuesta y metadata
 */
export async function sendChatMessage(
  message: string,
  sessionId?: string,
): Promise<ChatResponse> {
  const url = `${BACKEND_API_URL}/chat`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionId) {
    headers["X-Session-Id"] = sessionId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Backend respondió con ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const data: ChatResponse = await res.json();
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "El backend no respondió a tiempo. Intentá de nuevo.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ──────────────────────────────────────────────
// Outbound API — proactive messaging
// ──────────────────────────────────────────────

export type PendingNotification = {
  notification_id: string;
  phone: string;
  content: string;
  customer_name: string;
};

type PendingResponse = {
  items: PendingNotification[];
};

const OUTBOUND_TIMEOUT_MS = 10_000;

/**
 * Fetch pending outbound WhatsApp notifications from the backend.
 */
export async function getPendingOutbound(
  limit = 20,
): Promise<PendingNotification[]> {
  const url = `${BACKEND_API_URL}/outbound/pending?limit=${limit}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(
        `[outbound] GET /outbound/pending responded ${res.status}`,
      );
      return [];
    }

    const data: PendingResponse = await res.json();
    return data.items;
  } catch (err) {
    console.warn("[outbound] Error fetching pending:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Mark a notification as sent.
 */
export async function markOutboundSent(
  notificationId: string,
): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/outbound/${notificationId}/sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn(
      `[outbound] Error marking ${notificationId} as sent:`,
      err,
    );
  }
}

/**
 * Mark a notification as responded (customer replied).
 */
export async function markOutboundResponded(
  notificationId: string,
): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/outbound/${notificationId}/responded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn(
      `[outbound] Error marking ${notificationId} as responded:`,
      err,
    );
  }
}

/**
 * Mark a notification as failed delivery.
 */
export async function markOutboundFailed(
  notificationId: string,
  error: string,
): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/outbound/${notificationId}/failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error }),
    });
  } catch (err) {
    console.warn(
      `[outbound] Error marking ${notificationId} as failed:`,
      err,
    );
  }
}
