import { randomBytes } from "node:crypto";
import { auth, getBetterAuthServer } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { buildTenantAuthEmail, db, eq } from "@repo/database";
import { user } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await getSiteAdminStatus(session.user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await db().select().from(user).orderBy(user.createdAt);

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await getSiteAdminStatus(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const name = (body?.name ?? "").toString().trim();
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const role = (body?.role ?? "user").toString();
    const tenantId = (body?.tenantId ?? "default").toString().trim();
    const authEmail = buildTenantAuthEmail(tenantId, email);

    if (!name || !email) {
      return NextResponse.json(
        { error: "name and email are required" },
        { status: 400 },
      );
    }

    const existing = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, authEmail))
      .limit(1);
    if (existing[0]) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 },
      );
    }

    // Provision a Better Auth account with a strong random password.
    // The user should reset via "forgot password" to choose their own.
    const tempPassword = randomBytes(24).toString("base64url");
    const server = getBetterAuthServer();
    const result = await server.signUpEmail({
      email,
      password: tempPassword,
      name,
      tenantId,
    });
    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message ?? "Failed to create user" },
        { status: 500 },
      );
    }

    // Pull the fresh row and apply the admin-selected role if non-default.
    const [row] = await db()
      .select()
      .from(user)
      .where(eq(user.email, authEmail))
      .limit(1);

    if (row && role !== "user") {
      await db().update(user).set({ role }).where(eq(user.id, row.id));
    }

    return NextResponse.json({ user: { ...row, role } }, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create user", message },
      { status: 500 },
    );
  }
}
