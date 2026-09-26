import {
  parseBody,
  pickAllowedFields,
  requireSiteAdmin,
} from "@/app/api/admin/_lib/resource-crud";
import { agent, db, eq } from "@repo/database";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const { id } = await params;
  const [row] = await db()
    .select()
    .from(agent)
    .where(eq(agent.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const { id } = await params;
  const bodyOrError = await parseBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const allowed = [
    "name",
    "description",
    "category",
    "iconUrl",
    "docsUrl",
    "status",
    "isSystemManaged",
    "systemPrompt",
    "model",
    "temperature",
    "configSchema",
    "metadata",
  ] as const;

  const update = pickAllowedFields(bodyOrError, allowed);
  // temperature is stored as string in the DB
  if ("temperature" in update && typeof update.temperature === "number") {
    update.temperature = String(update.temperature);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }
  const [row] = await db()
    .update(agent)
    .set(update)
    .where(eq(agent.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const { id } = await params;
  await db().delete(agent).where(eq(agent.id, id));
  return NextResponse.json({ success: true });
}
