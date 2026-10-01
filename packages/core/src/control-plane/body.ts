import "server-only";
import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

function badRequest(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
) {
  const error = issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
  return NextResponse.json({ error, code: "invalid_request" }, { status: 400 });
}

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
  return { ok: false, response: badRequest(parsed.error.issues) };
}

/** Validates the query string of a GET with one of the contract's query schemas. */
export function parseSearchParams<T>(
  request: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): ParsedBody<T> {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, response: badRequest(parsed.error.issues) };
}
