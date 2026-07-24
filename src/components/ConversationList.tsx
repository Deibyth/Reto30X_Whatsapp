"use client";
import { useState } from "react";
import type { Conversation } from "@/lib/db";

interface Props {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
}: Props) {
  const [deleting, setDeleting] = useState<number | null>(null);

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-4">
        Sin conversaciones aún
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <div
          key={c.id}
          className={`group relative flex items-center border-b border-gray-800 transition-colors ${
            selectedId === c.id ? "bg-gray-800" : "hover:bg-gray-800/50"
          }`}
        >
          <button
            onClick={() => onSelect(c.id)}
            className="flex-1 text-left px-4 py-3 min-w-0"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm truncate">
                {c.name || c.phone}
              </span>
              <span className="text-[10px] text-gray-500 shrink-0 ml-2">
                {timeAgo(c.last_message_at)}
              </span>
            </div>
            {c.last_message_preview && (
              <p className="text-xs text-gray-500 truncate mb-1">
                {c.last_message_preview}
              </p>
            )}
            <span
              className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                c.mode === "AI"
                  ? "bg-emerald-900/50 text-emerald-400"
                  : "bg-amber-900/50 text-amber-400"
              }`}
            >
              {c.mode}
            </span>
          </button>

          {/* Delete button — aparece al hover */}
          {deleting === c.id ? (
            <div className="flex items-center gap-1 pr-3 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                  setDeleting(null);
                }}
                className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
              >
                Sí, borrar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(null);
                }}
                className="text-[10px] bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleting(c.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity mr-3 p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 shrink-0"
              title="Eliminar conversación"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
