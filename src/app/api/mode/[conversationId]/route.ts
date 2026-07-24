import { NextRequest, NextResponse } from "next/server";
import { setMode, getConversationById } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = Number(conversationId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json(
      { error: "Conversación no encontrada" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const { mode } = body;

  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json(
      { error: "Modo debe ser AI o HUMAN" },
      { status: 400 }
    );
  }

  setMode(id, mode);
  return NextResponse.json({ ok: true, mode });
}
