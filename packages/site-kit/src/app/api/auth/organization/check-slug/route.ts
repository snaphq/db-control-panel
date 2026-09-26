import { db, resolveTenantFromHost } from "@repo/database";
import { and, eq } from "@repo/database";
import { organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json(
        { error: "Slug parameter is required" },
        { status: 400 },
      );
    }

    // Normalize slug
    const normalizedSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    if (normalizedSlug.length < 2) {
      return NextResponse.json(
        { error: "Slug must be at least 2 characters" },
        { status: 400 },
      );
    }
    const tenant = await resolveTenantFromHost((await headers()).get("host"));
    if (!tenant) {
      return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
    }

    // Check if slug exists
    const existing = await db()
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.tenantId, tenant.id),
          eq(organization.slug, normalizedSlug),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ available: true });
    }

    // Slug is taken, generate a suggestion
    let suggestion = normalizedSlug;
    let counter = 1;
    let isAvailable = false;

    while (!isAvailable && counter <= 100) {
      suggestion = `${normalizedSlug}-${counter}`;
      const checkSuggestion = await db()
        .select({ id: organization.id })
        .from(organization)
        .where(
          and(
            eq(organization.tenantId, tenant.id),
            eq(organization.slug, suggestion),
          ),
        )
        .limit(1);

      if (checkSuggestion.length === 0) {
        isAvailable = true;
      } else {
        counter++;
      }
    }

    return NextResponse.json({
      available: false,
      suggestion: isAvailable ? suggestion : undefined,
    });
  } catch (error) {
    console.error("Error checking slug availability:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
