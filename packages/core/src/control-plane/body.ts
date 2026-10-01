import "server-only";
import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Validates a JSON body with one of the contract's request schemas. A missing
 * body is treated as `{}` so schemas with defaults (token access) still apply.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<ParsedBody<T>> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const error = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
  return {
    ok: false,
    response: NextResponse.json(
      { error, code: "invalid_request" },
      { status: 400 },
    ),
  };
}
