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
