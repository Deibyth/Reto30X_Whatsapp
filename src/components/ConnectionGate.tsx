"use client";
import { useState, useEffect, useCallback } from "react";
import QRScreen from "./QRScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import type { Conversation, Message } from "@/lib/db";

type ConnectionStatus = {
  status: string;
  qrPng?: string;
  phone?: string | null;
};

export default function ConnectionGate() {
  const [connection, setConnection] = useState<ConnectionStatus>({
    status: "disconnected",
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/connection/status");
      if (!res.ok) return;
      const data = await res.json();
      setConnection(data);
    } catch {}
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
  }, []);

  const fetchMessages = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/messages/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConversations();
  }, [fetchStatus, fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus();
      fetchConversations();
      if (selectedId) fetchMessages(selectedId);
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchConversations, fetchMessages, selectedId]);

  const handleDisconnect = async () => {
    await fetch("/api/connection/disconnect", { method: "POST" });
    setSelectedId(null);
    setMessages([]);
    await fetchStatus();
  };

  const handleModeChange = async (id: number, mode: "AI" | "HUMAN") => {
    await fetch(`/api/mode/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, mode } : c))
    );
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
    }
    await fetchConversations();
  };

  const handleSendMessage = async (id: number, content: string) => {
    await fetch(`/api/messages/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await fetchMessages(id);
    await fetchConversations();
  };

  const selectedConversation =
    conversations.find((c) => c.id === selectedId) ?? null;

  if (connection.status !== "connected") {
    return (
      <QRScreen
        qrPng={connection.qrPng ?? null}
        status={connection.status}
        onRetry={fetchStatus}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <DashboardHeader
        phone={connection.phone ?? null}
        onDisconnect={handleDisconnect}
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-gray-800 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-800">
            <h1 className="text-sm font-bold uppercase tracking-wider text-gray-400">
              Conversaciones
            </h1>
          </div>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onDelete={handleDelete}
          />
        </aside>
        <main className="flex-1 flex flex-col">
          {selectedConversation ? (
            <ConversationPanel
              conversation={selectedConversation}
              messages={messages}
              onModeChange={handleModeChange}
              onDelete={handleDelete}
              onSendMessage={handleSendMessage}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Seleccioná una conversación
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
