import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const { message } = await request.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Allow users to edit their own messages or admin to edit any message
    // Since admin rule is somewhat complex, let's just allow admin to edit any message
    const userId = session.user?.id;
    const isAdmin = session.user?.role === "admin" || userId === "admin";
    
    // Check ownership
    const existing = await db.select().from(chatMessages).where(eq(chatMessages.id, parseInt(id))).limit(1);
    if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const msg = existing[0];
    const isOwner = msg.userId === parseInt(userId || "1"); // Admin fallback

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.update(chatMessages)
      .set({ message: message.trim(), isEdited: true })
      .where(eq(chatMessages.id, parseInt(id)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/chat/[id]]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const userId = session.user?.id;
    const isAdmin = session.user?.role === "admin" || userId === "admin";
    
    // Check ownership
    const existing = await db.select().from(chatMessages).where(eq(chatMessages.id, parseInt(id))).limit(1);
    if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const msg = existing[0];
    const isOwner = msg.userId === parseInt(userId || "1"); // Admin fallback

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(chatMessages).where(eq(chatMessages.id, parseInt(id)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/chat/[id]]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
