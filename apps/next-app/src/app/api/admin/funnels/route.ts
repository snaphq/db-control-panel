import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { asc, db } from "@repo/database";
import { type AnalyticsFunnelStep, analyticsFunnel } from "@repo/database";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function gate() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) {
    return {
      session,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, response: null };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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

export async function GET() {
  const g = await gate();
  if (g.response) return g.response;

  const rows = await db()
    .select()
    .from(analyticsFunnel)
    .orderBy(asc(analyticsFunnel.orderIndex), asc(analyticsFunnel.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const g = await gate();
  if (g.response) return g.response;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const steps = parseSteps(body.steps);
  if (!steps) {
    return NextResponse.json(
      { error: "At least one step is required (label + path)" },
      { status: 400 },
    );
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const orderIndex = Number(body.orderIndex ?? 0) || 0;

  const baseSlug = slugify(name) || nanoid(8).toLowerCase();
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 5) {
    try {
      const [row] = await db()
        .insert(analyticsFunnel)
        .values({
          id: nanoid(),
          name,
          slug,
          description,
          steps,
          orderIndex,
          createdBy: g.session?.user.id ?? null,
        })
        .returning();
      return NextResponse.json(row, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("analytics_funnel_slug_unique") ||
        msg.includes("duplicate")
      ) {
        attempt++;
        slug = `${baseSlug}-${nanoid(4).toLowerCase()}`;
        continue;
      }
      console.error("create funnel failed", err);
      return NextResponse.json(
        { error: "Failed to create funnel" },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({ error: "Slug collision" }, { status: 409 });
}
