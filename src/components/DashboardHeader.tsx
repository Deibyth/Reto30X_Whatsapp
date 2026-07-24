"use client";

interface Props {
  phone: string | null;
  onDisconnect: () => void;
}

export default function DashboardHeader({ phone, onDisconnect }: Props) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-medium">
          {phone ? `+${phone}` : "Conectado"}
        </span>
      </div>
      <button
        onClick={onDisconnect}
        className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-900/50 hover:bg-red-900/20 transition-colors"
      >
        Desconectar
      </button>
    </header>
  );
}
