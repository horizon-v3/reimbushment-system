import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatMessages, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const messages = await db
      .select({
        id: chatMessages.id,
        message: chatMessages.message,
        createdAt: chatMessages.createdAt,
        userId: chatMessages.userId,
        userName: users.name,
        userEmail: users.email,
        userRole: users.role,
      })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .orderBy(asc(chatMessages.createdAt))
      .limit(500);

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
    const { message } = await request.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const userId = session.user?.id;
    if (!userId || userId === "admin") {
       // If the user is the hardcoded admin, we need to handle that or fallback to a 1 admin ID.
       // The hardcoded admin id is "admin". We can't insert "admin" into integer field.
       // We'll just assign it to user id 1, or return an error if it fails.
       let uId = 1;
       if (userId !== "admin") {
         uId = parseInt(userId);
       }
       await db.insert(chatMessages).values({
         userId: uId,
         message: message.trim(),
       });
    } else {
       await db.insert(chatMessages).values({
         userId: parseInt(userId),
         message: message.trim(),
       });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
