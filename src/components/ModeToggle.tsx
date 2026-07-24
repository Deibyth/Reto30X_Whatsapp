"use client";

interface Props {
  mode: "AI" | "HUMAN";
  onChange: (mode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 font-medium">MODO</span>
      <button
        onClick={() => onChange("AI")}
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
          mode === "AI"
            ? "bg-emerald-600 text-white shadow-md"
            : "bg-gray-800 text-gray-400 hover:bg-gray-700"
        }`}
      >
        IA
      </button>
      <button
        onClick={() => onChange("HUMAN")}
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
          mode === "HUMAN"
            ? "bg-amber-600 text-white shadow-md"
            : "bg-gray-800 text-gray-400 hover:bg-gray-700"
        }`}
      >
        HUMANO
      </button>
    </div>
  );
}
