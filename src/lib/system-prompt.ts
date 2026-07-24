import fs from "node:fs";
import path from "node:path";

const PROMPT_PATH = path.resolve(process.cwd(), "agent", "system-prompt.md");

let cachedContent: string | null = null;
let cachedMtimeMs = 0;

const DEFAULT_PROMPT = `
Eres un asistente de WhatsApp útil y amable. Respondes preguntas, das información y ayudas al usuario en lo que necesite.

REGLAS:
1. Responde siempre en español, de forma clara y directa.
2. Si no sabes algo, dilo honestamente.
3. No inventes datos, precios ni especificaciones.
4. Si no puedes resolver algo, deriva al usuario a contacto humano.
5. Usa un tono amable pero profesional.
`.trim();

export function getSystemPrompt(): string {
  try {
    const stat = fs.statSync(PROMPT_PATH);
    if (stat.mtimeMs !== cachedMtimeMs) {
      cachedContent = fs.readFileSync(PROMPT_PATH, "utf-8").trim();
      cachedMtimeMs = stat.mtimeMs;
    }
    return cachedContent ?? DEFAULT_PROMPT;
  } catch {
    return cachedContent ?? DEFAULT_PROMPT;
  }
}

export const SYSTEM_PROMPT = getSystemPrompt();
