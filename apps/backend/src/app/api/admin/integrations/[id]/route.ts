import {
  parseBody,
  pickAllowedFields,
  requireSiteAdmin,
} from "@/app/api/admin/_lib/resource-crud";
import { db, eq } from "@repo/database";
import { integration, integrationInstallation } from "@repo/database/schema";
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
    .from(integration)
    .where(eq(integration.id, id))
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
    "configSchema",
    "metadata",
  ] as const;

  const update = pickAllowedFields(bodyOrError, allowed);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }
  const [row] = await db()
    .update(integration)
    .set(update)
    .where(eq(integration.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const { id } = await params;
  const installs = await db()
    .select({ id: integrationInstallation.id })
    .from(integrationInstallation)
    .where(eq(integrationInstallation.integrationId, id))
    .limit(1);
  if (installs.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete: installations exist for this integration." },
      { status: 400 },
    );
  }
  await db().delete(integration).where(eq(integration.id, id));
  return NextResponse.json({ success: true });
}
