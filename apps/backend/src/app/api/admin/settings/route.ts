import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

// Well-known app settings keys
const APP_SETTINGS_KEYS = {
  ENTERPRISE_CONTACT_LINK: "enterprise_contact_link",
  FREE_WORKSPACE_LIMIT: "free_workspace_limit",
  TRIAL_DURATION_DAYS: "trial_duration_days",
  PENDING_ORG_TTL_HOURS: "pending_org_ttl_hours",
  OPENAI_BASE_URL: "openai_base_url",
  OPENAI_API_KEY: "openai_api_key",
  OPENAI_DEFAULT_MODEL: "openai_default_model",
} as const;

/**
 * GET /api/admin/settings?key=xxx
 * Get app settings
 *
 * Query params:
 * - key: Optional filter by key
 *
 * Returns:
 * - Single setting if key is provided
 * - Array of all settings otherwise
 */
export async function GET(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (key) {
      const setting = await db()
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .limit(1);

      if (!setting[0]) {
        return NextResponse.json(
          { error: "Setting not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(setting[0]);
    }

    const settings = await db()
      .select()
      .from(appSettings)
      .orderBy(appSettings.key);

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching app settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/settings
 * Create or update an app setting
 *
 * Body:
 * - key: Setting key
 * - value: Setting value
 * - description: Optional description
 */
export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { key, value, description } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "key and value are required" },
        { status: 400 },
      );
    }

    // Check if setting exists
    const existing = await db()
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    if (existing[0]) {
      // Update
      await db()
        .update(appSettings)
        .set({
          value: String(value),
          description: description ?? existing[0].description,
          updatedBy: session.user.id,
        })
        .where(eq(appSettings.key, key));
    } else {
      // Create
      await db()
        .insert(appSettings)
        .values({
          id: nanoid(),
          key,
          value: String(value),
          description,
          updatedBy: session.user.id,
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting app setting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/settings
 * Delete an app setting
 *
 * Body:
 * - key: Setting key to delete
 */
export async function DELETE(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    await db().delete(appSettings).where(eq(appSettings.key, key));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting app setting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
