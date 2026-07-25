/**
 * Audio converter — converts MP3 bytes to OGG Opus for WhatsApp voice notes.
 *
 * WhatsApp voice notes (ptt: true) require OGG Opus format to render
 * as proper voice messages instead of multimedia/forwarded audio files.
 *
 * Uses ffmpeg via fluent-ffmpeg (prebuilt binary from @ffmpeg-installer).
 */

import { spawn } from "node:child_process";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const FFMPEG = ffmpegPath.path;

/**
 * Convert MP3 audio bytes to OGG Opus buffer for WhatsApp voice notes.
 *
 * @param mp3Buffer - Raw MP3 audio data (from ElevenLabs TTS)
 * @returns OGG Opus buffer ready to send as voice note
 */
export function convertToVoiceNote(mp3Buffer: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      FFMPEG,
      [
        "-y", // overwrite output
        "-i", "pipe:0", // read input from stdin
        "-f", "ogg", // output format: OGG
        "-c:a", "libopus", // Opus codec
        "-b:a", "24k", // 24 kbps (good for voice)
        "-ar", "24000", // 24kHz sample rate
        "-ac", "1", // mono
        "-application", "voip", // optimize for voice
        "-vbr", "on", // variable bitrate
        "pipe:1", // write output to stdout
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const chunks: Buffer[] = [];
    let errorOutput = "";

    // Collect stdout chunks (converted audio)
    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Collect stderr for error reporting (ffmpeg logs to stderr)
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    // Handle completion
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        const result = Buffer.concat(chunks);
        resolve(new Uint8Array(result));
      } else {
        const errMsg = errorOutput.split("\n").slice(-3).join(" ");
        reject(new Error(`ffmpeg exited with code ${code}: ${errMsg}`));
      }
    });

    // Handle spawn errors (e.g. ffmpeg not found)
    ffmpeg.on("error", (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    // Write MP3 to stdin and close it
    ffmpeg.stdin.write(Buffer.from(mp3Buffer));
    ffmpeg.stdin.end();
  });
}
