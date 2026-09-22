import {
  isValidExpiration,
  parseOperatorScope,
} from "@/lib/auth/operator-token";
import {
  MAX_OPERATOR_DESCRIPTION,
  MAX_OPERATOR_NAME,
  MAX_OPERATOR_TOKEN_LABEL,
  createOperatorWithToken,
  getSessionAndTenant,
  listOperatorsForUser,
  validateOperatorScope,
} from "@/lib/operators/management";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;

  const operators = await listOperatorsForUser(auth.userId, auth.tenantId);
  return NextResponse.json({ operators });
}

export async function POST(req: NextRequest) {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  if (name.length > MAX_OPERATOR_NAME) {
    return NextResponse.json({ error: "name_too_long" }, { status: 400 });
  }

  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  if (description.length > MAX_OPERATOR_DESCRIPTION) {
    return NextResponse.json(
      { error: "description_too_long" },
      { status: 400 },
    );
  }

  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (label.length > MAX_OPERATOR_TOKEN_LABEL) {
    return NextResponse.json({ error: "label_too_long" }, { status: 400 });
  }

  const expiration =
    typeof record.expiration === "string" ? record.expiration : "";
  if (!isValidExpiration(expiration)) {
    return NextResponse.json({ error: "invalid_expiration" }, { status: 400 });
  }

  const scope = parseOperatorScope(record.scope);
  if (!scope) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }

  const scopeValidation = await validateOperatorScope({
    tenantId: auth.tenantId,
    userId: auth.userId,
    scope,
  });
  if (!scopeValidation.ok) {
    return NextResponse.json({ error: scopeValidation.error }, { status: 400 });
  }

  const created = await createOperatorWithToken({
    userId: auth.userId,
    tenantId: auth.tenantId,
    name,
    description: description.length > 0 ? description : null,
    scope: scopeValidation.scope,
    expiration,
    label: label.length > 0 ? label : null,
  });

  return NextResponse.json(created, { status: 201 });
}
