/**
 * Carga variables de entorno desde .env para el proceso bot.
 * Next.js carga .env automáticamente, pero el bot corre con tsx.
 */
import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const ENV_EXAMPLE_PATH = path.resolve(process.cwd(), ".env.example");

function loadEnvFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore
  }
}

// Load .env first, then .env.example as fallback
loadEnvFile(ENV_PATH);
loadEnvFile(ENV_EXAMPLE_PATH);
