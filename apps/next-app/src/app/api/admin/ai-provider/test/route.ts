import { getOpenAIConfig } from "@/lib/ai-provider";
import { getSiteAdminStatus } from "@/lib/auth-utils";
import {
  assertSafeAiProviderEndpoint,
  fetchSafeAiProvider,
  readLimitedResponseText,
} from "@/lib/integrations/mcp-proxy";
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const DEFAULT_BASE = "https://api.openai.com/v1";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await getSiteAdminStatus(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let config: Awaited<ReturnType<typeof getOpenAIConfig>>;
  try {
    config = await getOpenAIConfig();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Not configured",
      },
      { status: 400 },
    );
  }

  const base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  const url = `${base}/models`;

  try {
    // Validate before sending the server-held key. Only the origin is returned
    // to the admin UI; persisted provider paths must never be echoed as a
    // diagnostic URL.
    const endpoint = await assertSafeAiProviderEndpoint(url);
    const res = await fetchSafeAiProvider(endpoint.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await readLimitedResponseText(res);
    const displayUrl = endpoint.origin;
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: res.status,
          error: text.slice(0, 500) || res.statusText,
          url: displayUrl,
        },
        { status: 200 },
      );
    }
    let modelCount: number | null = null;
    try {
      const payload = JSON.parse(text) as { data?: unknown[] };
      if (Array.isArray(payload.data)) modelCount = payload.data.length;
    } catch {
      // Non-JSON OK response — still a successful reachability check.
    }
    return NextResponse.json({ ok: true, url: displayUrl, modelCount });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Request failed",
      },
      { status: 200 },
    );
  }
}
