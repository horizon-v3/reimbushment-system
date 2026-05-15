import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";

// Helper – only admin role can call these routes
async function requireAdmin() {
  const session = await auth();
  if (!session) return { error: "Unauthorized", status: 401 };
  if ((session.user as { role?: string })?.role !== "admin")
    return { error: "Forbidden – admin role required", status: 403 };
  return { session };
}

// ─── GET /api/admin/users — list all users ────────────────────────────────────
export async function GET() {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const allUsers = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);

  return NextResponse.json({ users: allUsers });
}

// ─── POST /api/admin/users — create user ─────────────────────────────────────
export async function POST(request: Request) {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const { email, password, name, role } = await request.json() as {
      email: string; password: string; name?: string; role?: string;
    };

    if (!email?.trim() || !password?.trim())
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });

    const validRoles = ["admin", "supervisor", "user"];
    const assignedRole = validRoles.includes(role ?? "") ? role! : "user";

    const passwordHash = await hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({ email: email.toLowerCase().trim(), passwordHash, name: name ?? email, role: assignedRole })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, name: name ?? email, role: assignedRole, updatedAt: new Date() },
      })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    return NextResponse.json({ ok: true, user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/admin/users — update role / name ───────────────────────────────
export async function PUT(request: Request) {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const { id, role, name, password } = await request.json() as {
      id: number; role?: string; name?: string; password?: string;
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const validRoles = ["admin", "supervisor", "user"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (role && validRoles.includes(role)) updates.role = role;
    if (name) updates.name = name;
    if (password) updates.passwordHash = await hash(password, 12);

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning({
      id: users.id, email: users.email, name: users.name, role: users.role,
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// ─── DELETE /api/admin/users — delete user ───────────────────────────────────
export async function DELETE(request: Request) {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Prevent deleting yourself
  const sessionUserId = parseInt((check.session!.user as { id?: string })?.id ?? "0");
  if (id === sessionUserId)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
