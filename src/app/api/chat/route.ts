import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatMessages, users } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const recipientId = url.searchParams.get("recipientId");
  const currentUserId = session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "1");

  try {
    let query = db
      .select({
        id: chatMessages.id,
        message: chatMessages.message,
        createdAt: chatMessages.createdAt,
        userId: chatMessages.userId,
        recipientId: chatMessages.recipientId,
        fileUrl: chatMessages.fileUrl,
        fileName: chatMessages.fileName,
        isEdited: chatMessages.isEdited,
        userName: users.name,
        userEmail: users.email,
        userRole: users.role,
      })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id));

    if (recipientId) {
      // Direct messages between current user and recipient
      const rId = parseInt(recipientId);
      query = query.where(
        sql`(chat_messages.user_id = ${currentUserId} AND chat_messages.recipient_id = ${rId}) OR (chat_messages.user_id = ${rId} AND chat_messages.recipient_id = ${currentUserId})`
      ) as any;
    } else {
      // Team chat (recipient_id IS NULL)
      query = query.where(sql`chat_messages.recipient_id IS NULL`) as any;
    }

    const messages = await query.orderBy(asc(chatMessages.createdAt)).limit(500);

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[GET /api/chat]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { message, recipientId, fileUrl, fileName } = await request.json();
    if (!message && !fileUrl) {
      return NextResponse.json({ error: "Message or file is required" }, { status: 400 });
    }

    const userId = session.user?.id;
    let uId = 1;
    if (userId && userId !== "admin") {
      uId = parseInt(userId);
    }

    await db.insert(chatMessages).values({
      userId: uId,
      recipientId: recipientId ? parseInt(recipientId) : null,
      message: message ? message.trim() : "",
      fileUrl: fileUrl || null,
      fileName: fileName || null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
