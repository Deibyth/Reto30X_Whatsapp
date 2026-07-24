import "./env-loader";
import fs from "node:fs";
import path from "node:path";
import { start, shutdown } from "../src/lib/baileys/client";

const RESTART_FLAG = path.resolve(process.cwd(), "data", ".restart");
const AUTH_DIR = path.resolve(process.cwd(), "auth");

async function main() {
  console.log("[bot] Iniciando Anna — Agente WhatsApp Colsubsidio...");

  await start();

  setInterval(() => {
    if (fs.existsSync(RESTART_FLAG)) {
      fs.unlinkSync(RESTART_FLAG);
      console.log("[bot] Flag de reinicio detectado — reconectando...");
      (async () => {
        await shutdown();
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          console.log("[bot] Carpeta auth limpiada");
        }
        await start();
      })();
    }
  }, 1000);
}

process.on("SIGINT", async () => {
  console.log("\n[bot] Cerrando...");
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[bot] Terminado...");
  await shutdown();
  process.exit(0);
});

main().catch((err) => {
  console.error("[bot] Error fatal:", err);
  process.exit(1);
});
