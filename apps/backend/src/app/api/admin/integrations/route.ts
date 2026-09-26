import {
  normaliseStatus,
  parseBody,
  requireSiteAdmin,
  validateResourceFields,
} from "@/app/api/admin/_lib/resource-crud";
import { db } from "@repo/database";
import { integration } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

export async function GET() {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const rows = await db().select().from(integration);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const bodyOrError = await parseBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const validationError = validateResourceFields(bodyOrError);
  if (validationError) return validationError;

  const {
    slug,
    name,
    description,
    category,
    iconUrl,
    docsUrl,
    status,
    isSystemManaged,
    configSchema,
    metadata,
  } = bodyOrError;

  try {
    const [row] = await db()
      .insert(integration)
      .values({
        id: nanoid(),
        slug: slug as string,
        name: name as string,
        description: typeof description === "string" ? description : null,
        category: category as string,
        iconUrl: typeof iconUrl === "string" ? iconUrl : null,
        docsUrl: typeof docsUrl === "string" ? docsUrl : null,
        status: normaliseStatus(status),
        isSystemManaged: Boolean(isSystemManaged),
        configSchema: configSchema ?? null,
        metadata: metadata ?? null,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
