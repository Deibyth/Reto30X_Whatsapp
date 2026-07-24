"use client";
import { useState, useEffect, useRef } from "react";
import type { Conversation, Message } from "@/lib/db";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface Props {
  conversation: Conversation;
  messages: Message[];
  onModeChange: (id: number, mode: "AI" | "HUMAN") => void;
  onDelete: (id: number) => void;
  onSendMessage: (id: number, content: string) => void;
}

export default function ConversationPanel({
  conversation,
  messages,
  onModeChange,
  onDelete,
  onSendMessage,
}: Props) {
  const [input, setInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  // Detectar si el usuario hizo scroll hacia arriba
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-scroll solo si el usuario está cerca del fondo
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(conversation.id, trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <div>
          <h2 className="font-semibold text-sm">
            {conversation.name || conversation.phone}
          </h2>
          <p className="text-xs text-gray-500">{conversation.phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            mode={conversation.mode}
            onChange={(m) => onModeChange(conversation.id, m)}
          />
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete(conversation.id);
                  setShowDeleteConfirm(false);
                }}
                className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
              >
                Confirmar
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
            >
              Borrar
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Sin mensajes
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            timestamp={m.created_at}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-800 shrink-0">
        {conversation.mode === "AI" ? (
          <p className="text-xs text-gray-500 text-center py-2">
            El bot responde automáticamente
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí un mensaje..."
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
