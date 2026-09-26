import { getAdminSession } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

/**
 * Shared helpers for admin resource CRUD routes (agents, integrations).
 */

/** Returns a 401 response unless the request has a backend admin session. */
export async function requireSiteAdmin(): Promise<NextResponse | null> {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Parses and validates the request body as a non-null object. */
export async function parseBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  return body as Record<string, unknown>;
}

/** Validates slug, name, and category fields. Returns an error response or null. */
export function validateResourceFields(
  body: Record<string, unknown>,
): NextResponse | null {
  const { slug, name, category } = body;
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase alphanumeric with dashes" },
      { status: 400 },
    );
  }
  if (typeof name !== "string" || !name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof category !== "string" || !category) {
    return NextResponse.json(
      { error: "category is required" },
      { status: 400 },
    );
  }
  return null;
}

/** Normalises a status value to the allowed set, defaulting to "active". */
export function normaliseStatus(
  value: unknown,
): "active" | "beta" | "deprecated" | "hidden" {
  if (
    value === "beta" ||
    value === "deprecated" ||
    value === "hidden" ||
    value === "active"
  ) {
    return value;
  }
  return "active";
}

/** Picks only allowed keys from a body object for PATCH updates. */
export function pickAllowedFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  return update;
}
