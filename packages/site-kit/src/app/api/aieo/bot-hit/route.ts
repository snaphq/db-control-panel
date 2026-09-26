/**
 * POST /api/aieo/bot-hit
 *
 * Ingests AI bot crawl hits from the proxy. Protected by CRON_SECRET.
 *
 * Body: { date: string, userAgent: string, path: string, hits?: number }
 */

import { upsertBotHit } from "@repo/database/dal/seo";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  let body: {
    date?: string;
    userAgent?: string;
    path?: string;
    hits?: number;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const { date, userAgent, path, hits = 1 } = body;
  if (!date || !userAgent || !path) {
    return new Response(
      JSON.stringify({ error: "date, userAgent, path required" }),
      { status: 422 },
    );
  }

  await upsertBotHit(date, userAgent, path, hits);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
