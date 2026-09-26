import {
  normaliseStatus,
  parseBody,
  requireSiteAdmin,
  validateResourceFields,
} from "@/app/api/admin/_lib/resource-crud";
import { agent, db } from "@repo/database";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

export async function GET() {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const rows = await db().select().from(agent);
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
    systemPrompt,
    model,
    temperature,
    configSchema,
    metadata,
  } = bodyOrError;

  try {
    const [row] = await db()
      .insert(agent)
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
        systemPrompt: typeof systemPrompt === "string" ? systemPrompt : null,
        model: typeof model === "string" && model ? model : null,
        temperature:
          typeof temperature === "number"
            ? String(temperature)
            : typeof temperature === "string" && temperature
              ? temperature
              : null,
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
