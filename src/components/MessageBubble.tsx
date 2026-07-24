"use client";

interface Props {
  role: "user" | "assistant" | "human";
  content: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ role, content, timestamp }: Props) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isHuman = role === "human";

  const align = isUser ? "justify-start" : "justify-end";
  const bg = isUser
    ? "bg-white text-gray-900 border border-gray-300"
    : isAssistant
    ? "bg-emerald-600 text-white"
    : "bg-amber-500 text-white";

  return (
    <div className={`flex ${align} mb-3`}>
      <div className={`max-w-[75%] px-4 py-2 rounded-2xl ${bg}`}>
        <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        <p
          className={`text-[10px] mt-1 ${
            isUser ? "text-gray-400" : "text-white/70"
          }`}
        >
          {formatTime(timestamp)}
          {isHuman && (
            <span className="ml-1 font-medium">(humano)</span>
          )}
        </p>
      </div>
    </div>
  );
}
