import { getOpenAIConfig } from "@/lib/ai-provider";
import {
  fetchSafeAiProvider,
  limitResponseBody,
  readLimitedResponseText,
} from "@/lib/integrations/mcp-proxy";
import { auth } from "@repo/auth/server";
import {
  agent,
  agentInstallation,
  and,
  db,
  eq,
  resolveTenantFromHost,
} from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_BASE = "https://api.openai.com/v1";
const FALLBACK_MODEL = "gpt-4o-mini";

type IncomingMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface RouteParams {
  params: Promise<{ id: string; slug: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { id: projectId, slug } = await params;

  const [proj] = await db()
    .select()
    .from(project)
    .innerJoin(organization, eq(project.organizationId, organization.id))
    .where(
      and(
        eq(project.id, projectId),
        eq(project.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!proj) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [m] = await db()
    .select()
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, proj.project.organizationId),
        eq(member.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!m) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [agentRow] = await db()
    .select()
    .from(agent)
    .where(eq(agent.slug, slug))
    .limit(1);
  if (!agentRow) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agentRow.status === "hidden" || agentRow.status === "deprecated") {
    return NextResponse.json(
      { error: `Agent is ${agentRow.status}` },
      { status: 403 },
    );
  }

  const [install] = await db()
    .select()
    .from(agentInstallation)
    .where(
      and(
        eq(agentInstallation.projectId, projectId),
        eq(agentInstallation.agentId, agentRow.id),
        eq(agentInstallation.organizationId, proj.project.organizationId),
      ),
    )
    .limit(1);
  if (!install) {
    return NextResponse.json(
      { error: "Agent is not installed in this project" },
      { status: 403 },
    );
  }
  if (install.status === "disabled") {
    return NextResponse.json(
      { error: "Agent installation is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: IncomingMessage[];
    stream?: boolean;
    model?: string;
    temperature?: number;
  } | null;

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  const userMessages = body.messages
    .filter(
      (msg): msg is IncomingMessage =>
        !!msg &&
        typeof msg.content === "string" &&
        (msg.role === "user" ||
          msg.role === "assistant" ||
          msg.role === "system"),
    )
    .filter((msg) => msg.role !== "system");

  if (userMessages.length === 0) {
    return NextResponse.json(
      { error: "at least one user/assistant message is required" },
      { status: 400 },
    );
  }

  let config: Awaited<ReturnType<typeof getOpenAIConfig>>;
  try {
    config = await getOpenAIConfig(proj.project.organizationId);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Provider not configured",
      },
      { status: 503 },
    );
  }

  const base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  const model =
    body.model?.trim() ||
    agentRow.model ||
    config.defaultModel ||
    FALLBACK_MODEL;
  const temperature =
    typeof body.temperature === "number"
      ? body.temperature
      : agentRow.temperature !== null
        ? Number(agentRow.temperature)
        : undefined;
  const stream = body.stream !== false;

  const messages: IncomingMessage[] = [];
  if (agentRow.systemPrompt) {
    messages.push({ role: "system", content: agentRow.systemPrompt });
  }
  messages.push(...userMessages);

  let upstream: Response;
  try {
    upstream = await fetchSafeAiProvider(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        ...(temperature !== undefined ? { temperature } : {}),
      }),
      signal: AbortSignal.timeout(stream ? 120_000 : 30_000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Unable to reach AI provider",
        detail: err instanceof Error ? err.message : "Request failed",
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const errorText = await readLimitedResponseText(upstream).catch(() => "");
    return NextResponse.json(
      {
        error: "Upstream provider error",
        status: upstream.status,
        detail: errorText.slice(0, 1000),
      },
      { status: 502 },
    );
  }

  if (!stream) {
    try {
      const payload = JSON.parse(await readLimitedResponseText(upstream));
      return NextResponse.json(payload);
    } catch {
      return NextResponse.json(
        { error: "AI provider returned an invalid response" },
        { status: 502 },
      );
    }
  }

  const bounded = await limitResponseBody(upstream).catch(() => null);
  if (!bounded) {
    return NextResponse.json(
      { error: "AI provider response is too large" },
      { status: 502 },
    );
  }

  return new Response(bounded.body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
