"use client";
import { useEffect, useState } from "react";

interface Props {
  qrPng: string | null;
  status: string;
  onRetry?: () => void;
}

export default function QRScreen({ qrPng, status, onRetry }: Props) {
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (status === "disconnected" && !qrPng) {
      const timer = setTimeout(() => setShowError(true), 10000);
      return () => clearTimeout(timer);
    }
    setShowError(false);
  }, [status, qrPng]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            Conectar WhatsApp
          </h1>
          <p className="text-sm text-gray-400">
            Escaneá el código QR desde WhatsApp &gt; Dispositivos vinculados
          </p>
        </div>

        {status === "qr" && qrPng && (
          <>
            <div className="bg-white rounded-xl p-4 inline-block mb-4">
              <img
                src={qrPng}
                alt="QR WhatsApp"
                className="w-64 h-64"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-amber-400 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Esperando escaneo...
            </div>
          </>
        )}

        {status === "connecting" && !qrPng && (
          <div className="flex items-center justify-center gap-2 text-blue-400 text-sm py-8">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Conectando...
          </div>
        )}

        {status === "disconnected" && !qrPng && (
          <div className="py-8">
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm mb-4">
              <svg
                className="w-5 h-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Esperando conexión del bot...
            </div>
            {showError && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-xs text-red-300">
                El proceso bot no está disponible. Asegurate de ejecutar{" "}
                <code className="bg-red-950 px-1 rounded text-red-200">
                  npm run start:bot
                </code>{" "}
                en otra terminal.
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="block mt-2 text-red-200 underline hover:text-red-100"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
