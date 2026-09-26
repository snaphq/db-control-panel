import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { db, eq } from "@repo/database";
import { type AnalyticsFunnelStep, analyticsFunnel } from "@repo/database";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function gate() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function parseSteps(input: unknown): AnalyticsFunnelStep[] | null {
  if (!Array.isArray(input)) return null;
  const out: AnalyticsFunnelStep[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const label = String(r.label ?? "").trim();
    const path = String(r.path ?? "").trim();
    const matchType = r.matchType === "prefix" ? "prefix" : "exact";
    if (!label || !path) return null;
    out.push({ label, path: normalizePath(path), matchType });
  }
  return out.length > 0 ? out : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Partial<typeof analyticsFunnel.$inferInsert> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 },
      );
    }
    update.name = name;
  }
  if ("description" in body) {
    update.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if ("steps" in body) {
    const steps = parseSteps(body.steps);
    if (!steps) {
      return NextResponse.json(
        { error: "At least one step is required (label + path)" },
        { status: 400 },
      );
    }
    update.steps = steps;
  }
  if ("orderIndex" in body) {
    update.orderIndex = Number(body.orderIndex ?? 0) || 0;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [row] = await db()
    .update(analyticsFunnel)
    .set(update)
    .where(eq(analyticsFunnel.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate();
  if (denied) return denied;

  const { id } = await params;
  const [row] = await db()
    .delete(analyticsFunnel)
    .where(eq(analyticsFunnel.id, id))
    .returning({ id: analyticsFunnel.id });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
