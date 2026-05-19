import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureOpPermTable, writeAuditLog } from "@/lib/audit";

function getIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ─── GET /api/operation-permissions ──────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    await ensureOpPermTable();
    const rows = await db.execute(sql`
      SELECT * FROM operation_permissions ORDER BY created_at DESC LIMIT 100
    `);
    return NextResponse.json({ permissions: Array.from(rows) });
  } catch (err) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── POST /api/operation-permissions — supervisor requests overwrite perm ─────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role     = (session.user as { role?: string }).role ?? "staff";
  const userId   = (session.user as { id?: string }).id;
  const userName = session.user?.name ?? session.user?.email ?? "unknown";
  const ip       = getIP(request);

  if (role !== "supervisor") {
    return NextResponse.json({ error: "Only supervisors can request permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { operation, description } = body as { operation: string; description?: string };

  try {
    await ensureOpPermTable();

    // Check for existing pending request
    const existing = Array.from(await db.execute(sql`
      SELECT id FROM operation_permissions
      WHERE requested_by = ${parseInt(userId ?? "0")}
        AND operation = ${operation}
        AND status = 'pending'
      LIMIT 1
    `));
    if (existing.length > 0) {
      return NextResponse.json({ ok: false, error: "A pending request already exists for this operation" }, { status: 409 });
    }

    await db.execute(sql`
      INSERT INTO operation_permissions
        (requested_by, requested_by_name, operation, description, status, created_at, updated_at)
      VALUES
        (${parseInt(userId ?? "0")}, ${userName}, ${operation}, ${description ?? null}, 'pending', NOW(), NOW())
    `);

    await writeAuditLog({
      userId: parseInt(userId ?? "0"), userName, userRole: role,
      action: "request_permission", entityType: "operation_permissions",
      status: "pending", ipAddress: ip,
      metadata: { operation, description },
    });

    return NextResponse.json({ ok: true, message: "Permission request sent to admin" });
  } catch (err) {
    console.error("[POST /api/operation-permissions]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── PATCH /api/operation-permissions — admin approves/denies/revokes ─────────
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role     = (session.user as { role?: string }).role ?? "staff";
  const adminId  = (session.user as { id?: string }).id;
  const adminName = session.user?.name ?? session.user?.email ?? "admin";
  const ip       = getIP(request);

  if (role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json();
  const { id, action, confirmText } = body as {
    id: number;
    action: "approve" | "deny" | "revoke";
    confirmText?: string;
  };

  if (action === "approve" && confirmText?.toLowerCase() !== "confirm") {
    return NextResponse.json({
      error: "You must type exactly \"confirm\" to approve this operation"
    }, { status: 400 });
  }

  try {
    await ensureOpPermTable();

    const newStatus = action === "approve" ? "approved" : action === "deny" ? "denied" : "revoked";

    await db.execute(sql`
      UPDATE operation_permissions SET
        status          = ${newStatus},
        approved_by     = ${parseInt(adminId ?? "0")},
        approved_by_name = ${adminName},
        confirmed_at    = NOW(),
        expires_at      = ${action === "approve" ? sql`NOW() + INTERVAL '24 hours'` : sql`NULL`},
        updated_at      = NOW()
      WHERE id = ${id}
    `);

    await writeAuditLog({
      userId: parseInt(adminId ?? "0"), userName: adminName, userRole: "admin",
      action: `permission_${newStatus}`, entityType: "operation_permissions",
      entityId: id, status: "success", ipAddress: ip,
      metadata: { action, id },
    });

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("[PATCH /api/operation-permissions]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
