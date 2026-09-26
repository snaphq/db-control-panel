import { ensureSeoAccess } from "@repo/core/seo-guard";
import { getBotCrawlTotals } from "@repo/database/dal/seo";
import { getReferrerTotals } from "@repo/database/dal/seo";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AIEO Referrers",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AieoReferrersPage() {
  await ensureSeoAccess("read");

  const [referrers30, botCrawls30] = await Promise.all([
    getReferrerTotals({ sinceDays: 30 }),
    getBotCrawlTotals({ sinceDays: 30 }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            AIEO Referrers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-source traffic (PostHog) and AI bot crawls (proxy) — last 30
            days.
          </p>
        </div>
        <Link
          href="/adminx/seo/aieo"
          className="text-sm text-primary hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base font-medium">
              AI referrer traffic
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Sessions and signups from AI hosts (via PostHog)
            </p>
          </div>
          <Badge variant="outline">{referrers30.length} sources</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Source</th>
                <th className="h-9 px-4 text-right font-medium">
                  Sessions (30d)
                </th>
                <th className="h-9 px-4 text-right font-medium">
                  Signups (30d)
                </th>
                <th className="h-9 px-4 text-right font-medium">Conv. rate</th>
              </tr>
            </thead>
            <tbody>
              {referrers30.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No AI referrer data yet. Set POSTHOG_API_KEY +
                    posthogProjectId and wait for the nightly cron.
                  </td>
                </tr>
              ) : (
                referrers30.map((r) => (
                  <tr key={r.source} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.source}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.sessions.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.signups.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.sessions > 0
                        ? `${((r.signups / r.sessions) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base font-medium">
              AI bot crawls
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Crawl hits captured by proxy.ts (last 30d)
            </p>
          </div>
          <Badge variant="outline">{botCrawls30.length} bots</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">User-Agent</th>
                <th className="h-9 px-4 text-right font-medium">
                  Total hits (30d)
                </th>
              </tr>
            </thead>
            <tbody>
              {botCrawls30.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No bot crawl data yet. Deploy the proxy to start capturing.
                  </td>
                </tr>
              ) : (
                botCrawls30.map((b) => (
                  <tr key={b.userAgent} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-sm">
                      {b.userAgent}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {b.hits.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
