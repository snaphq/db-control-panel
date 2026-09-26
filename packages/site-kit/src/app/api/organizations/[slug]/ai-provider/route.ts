import { auth } from "@repo/auth/server";
import {
  deleteOrgOpenAIConfig,
  getOpenAIConfig,
  getOrgOpenAIConfigMasked,
  upsertOrgOpenAIConfig,
} from "@repo/core/ai-provider";
import {
  type AiProviderChangeFields,
  logOrgAiProviderChange,
} from "@repo/core/ai-provider-audit";
import {
  assertSafeAiProviderEndpoint,
  fetchSafeAiProvider,
  readLimitedResponseText,
} from "@repo/core/integrations/mcp-proxy";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  // The dynamic segment is named `slug` to match sibling routes under
  // /api/organizations/[slug]/*, but callers pass the organization id here.
  params: Promise<{ slug: string }>;
}

const DEFAULT_BASE = "https://api.openai.com/v1";

async function requireOrgWriter(organizationId: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return {
      error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }),
    } as const;
  }
  const [m] = await db()
    .select({ member })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, organizationId),
        eq(member.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!m) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  if (m.member.role !== "owner" && m.member.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Only owners and admins can change AI provider settings." },
        { status: 403 },
      ),
    } as const;
  }
  return { session, tenant } as const;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug: id } = await params;
  const guard = await requireOrgWriter(id);
  if ("error" in guard) return guard.error;
  const config = await getOrgOpenAIConfigMasked(id);
  return NextResponse.json(config);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { slug: id } = await params;
  const guard = await requireOrgWriter(id);
  if ("error" in guard) return guard.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { baseUrl, apiKey, defaultModel, clearApiKey } = body as {
    baseUrl?: string | null;
    apiKey?: string;
    defaultModel?: string | null;
    clearApiKey?: boolean;
  };

  const trimmedBase = typeof baseUrl === "string" ? baseUrl.trim() : null;
  const trimmedModel =
    typeof defaultModel === "string" ? defaultModel.trim() : null;

  const nextApiKey = clearApiKey
    ? null
    : typeof apiKey === "string" && apiKey.trim()
      ? apiKey
      : undefined;

  if (trimmedBase) {
    try {
      await assertSafeAiProviderEndpoint(trimmedBase);
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
  }

  await upsertOrgOpenAIConfig({
    organizationId: id,
    updatedBy: guard.session.user.id,
    baseUrl: baseUrl === undefined ? undefined : trimmedBase || null,
    defaultModel: defaultModel === undefined ? undefined : trimmedModel || null,
    apiKey: nextApiKey,
  });

  const changes: AiProviderChangeFields = {};
  if (baseUrl !== undefined) changes.baseUrl = trimmedBase ? "set" : "cleared";
  if (defaultModel !== undefined)
    changes.defaultModel = trimmedModel ? "set" : "cleared";
  if (nextApiKey === null) changes.apiKey = "cleared";
  else if (typeof nextApiKey === "string") changes.apiKey = "set";
  await logOrgAiProviderChange(id, guard.session.user.id, changes);

  const config = await getOrgOpenAIConfigMasked(id);
  return NextResponse.json(config);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { slug: id } = await params;
  const guard = await requireOrgWriter(id);
  if ("error" in guard) return guard.error;
  await deleteOrgOpenAIConfig(id);
  await logOrgAiProviderChange(id, guard.session.user.id, {
    action: "ai_provider_reset",
    apiKey: "cleared",
    baseUrl: "cleared",
    defaultModel: "cleared",
  });
  return NextResponse.json({ success: true });
}

export async function PUT(_request: Request, { params }: RouteParams) {
  // Test the effective org config by hitting /v1/models.
  const { slug: id } = await params;
  const guard = await requireOrgWriter(id);
  if ("error" in guard) return guard.error;

  let config: Awaited<ReturnType<typeof getOpenAIConfig>>;
  try {
    config = await getOpenAIConfig(id);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Not configured",
      },
      { status: 200 },
    );
  }
  const base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  const url = `${base}/models`;
  try {
    const endpoint = await assertSafeAiProviderEndpoint(url);
    const res = await fetchSafeAiProvider(endpoint.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await readLimitedResponseText(res);
    const displayUrl = endpoint.origin;
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        url: displayUrl,
        status: res.status,
        error: text.slice(0, 500) || res.statusText,
        source: config.source,
      });
    }
    let modelCount: number | null = null;
    try {
      const payload = JSON.parse(text) as { data?: unknown[] };
      if (Array.isArray(payload.data)) modelCount = payload.data.length;
    } catch {
      /* ignore */
    }
    return NextResponse.json({
      ok: true,
      url: displayUrl,
      modelCount,
      source: config.source,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Request failed",
    });
  }
}
