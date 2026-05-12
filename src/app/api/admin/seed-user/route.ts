import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";

// POST /api/admin/seed-user - creates initial admin user
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, secretKey } = body as {
      email: string;
      password: string;
      name?: string;
      secretKey: string;
    };

    // Guard with a secret key
    if (secretKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const passwordHash = await hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name ?? email,
        role: "admin",
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, name: name ?? email, updatedAt: new Date() },
      })
      .returning();

    return NextResponse.json({ ok: true, userId: user.id, email: user.email });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/admin/seed-user - list users (admin only)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);

  return NextResponse.json({ users: allUsers });
}
