import {
  OPENAI_SETTING_KEYS,
  encryptOpenAIApiKey,
  getOpenAIConfigMasked,
} from "@/lib/ai-provider";
import {
  type AiProviderChangeFields,
  logAdminAiProviderChange,
} from "@/lib/ai-provider-audit";
import { getSiteAdminStatus } from "@/lib/auth-utils";
import { assertSafeAiProviderEndpoint } from "@/lib/integrations/mcp-proxy";
import { auth } from "@repo/auth/server";
import { db, eq } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id)
    return { error: "Unauthorized", status: 401 } as const;
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) return { error: "Forbidden", status: 403 } as const;
  return { session } as const;
}

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const config = await getOpenAIConfigMasked();
  return NextResponse.json(config);
}

async function upsert(key: string, value: string, userId: string) {
  const existing = await db()
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  if (existing[0]) {
    await db()
      .update(appSettings)
      .set({ value, updatedBy: userId })
      .where(eq(appSettings.key, key));
  } else {
    await db()
      .insert(appSettings)
      .values({ id: nanoid(), key, value, updatedBy: userId });
  }
}

async function removeKey(key: string) {
  await db().delete(appSettings).where(eq(appSettings.key, key));
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { session } = guard;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { baseUrl, apiKey, defaultModel } = body as {
    baseUrl?: string | null;
    apiKey?: string | null;
    defaultModel?: string | null;
  };

  const changes: AiProviderChangeFields = {};

  if (baseUrl !== undefined) {
    if (baseUrl?.trim()) {
      try {
        await assertSafeAiProviderEndpoint(baseUrl.trim());
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Invalid AI provider base URL",
          },
          { status: 400 },
        );
      }
      await upsert(
        OPENAI_SETTING_KEYS.BASE_URL,
        baseUrl.trim(),
        session.user.id,
      );
      changes.baseUrl = "set";
    } else {
      await removeKey(OPENAI_SETTING_KEYS.BASE_URL);
      changes.baseUrl = "cleared";
    }
  }

  if (defaultModel !== undefined) {
    if (defaultModel?.trim()) {
      await upsert(
        OPENAI_SETTING_KEYS.DEFAULT_MODEL,
        defaultModel.trim(),
        session.user.id,
      );
      changes.defaultModel = "set";
    } else {
      await removeKey(OPENAI_SETTING_KEYS.DEFAULT_MODEL);
      changes.defaultModel = "cleared";
    }
  }

  if (typeof apiKey === "string" && apiKey.trim()) {
    await upsert(
      OPENAI_SETTING_KEYS.API_KEY,
      encryptOpenAIApiKey(apiKey.trim()),
      session.user.id,
    );
    changes.apiKey = "set";
  }

  await logAdminAiProviderChange(session.user.id, changes);

  const config = await getOpenAIConfigMasked();
  return NextResponse.json(config);
}

export async function DELETE() {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  await removeKey(OPENAI_SETTING_KEYS.API_KEY);
  await logAdminAiProviderChange(guard.session.user.id, { apiKey: "cleared" });
  const config = await getOpenAIConfigMasked();
  return NextResponse.json(config);
}
