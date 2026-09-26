import { ensureSeoAccess } from "@/lib/seo-guard";
import {
  findKeywordsWithStaleSnapshots,
  listKeywords,
} from "@repo/database/dal/seo";
import { countPagesByStatus } from "@repo/database/dal/seo";
import { getLatestSnapshotsWithDelta } from "@repo/database/dal/seo";
import { Badge } from "@repo/react-ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SEO Workflow",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatRank(rank: number | null) {
  if (!rank) return <span className="text-muted-foreground">—</span>;
  return <span className="font-medium tabular-nums">#{rank}</span>;
}

function RankDelta({
  latest,
  previous,
}: {
  latest: number | null;
  previous: number | null;
}) {
  if (latest === null || previous === null)
    return <span className="text-xs text-muted-foreground">n/a</span>;
  const delta = previous - latest;
  if (delta === 0)
    return <span className="text-xs text-muted-foreground">0</span>;
  const positive = delta > 0;
  return (
    <span
      className={`text-xs font-medium tabular-nums ${
        positive ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

function fromUnix(unix: number): Date {
  return new Date(unix * 1000);
}

export default async function SeoWorkflowPage() {
  await ensureSeoAccess("read");

  const [keywordRows, allKeywords, pageCounts, staleKeywords] =
    await Promise.all([
      getLatestSnapshotsWithDelta({ activeOnly: true }),
      listKeywords({ activeOnly: true }),
      countPagesByStatus(),
      findKeywordsWithStaleSnapshots(14 * 86400),
    ]);

  const trackedKeywordCount = allKeywords.length;
  const pageOneKeywords = keywordRows.filter(
    (r) => r.latestPosition !== null && r.latestPosition <= 10,
  ).length;
  const topTwentyKeywords = keywordRows.filter(
    (r) => r.latestPosition !== null && r.latestPosition <= 20,
  ).length;

  const moversAll = keywordRows
    .filter((r) => r.latestPosition !== null && r.previousPosition !== null)
    .map((r) => ({
      ...r,
      delta: (r.previousPosition as number) - (r.latestPosition as number),
    }));
  const winners = [...moversAll].sort((a, b) => b.delta - a.delta).slice(0, 5);
  const losers = [...moversAll].sort((a, b) => a.delta - b.delta).slice(0, 5);

  const priorityWeight: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const tableRows = [...keywordRows]
    .sort((a, b) => {
      const pw =
        (priorityWeight[a.priority ?? "medium"] ?? 1) -
        (priorityWeight[b.priority ?? "medium"] ?? 1);
      if (pw !== 0) return pw;
      if (a.latestPosition === null && b.latestPosition === null) return 0;
      if (a.latestPosition === null) return 1;
      if (b.latestPosition === null) return -1;
      return a.latestPosition - b.latestPosition;
    })
    .slice(0, 30);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">SEO Workflow</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live keyword rank tracking and content pipeline
          </p>
        </div>
        <Link
          href="/seo/keywords"
          className="text-sm text-primary hover:underline"
        >
          Manage keywords →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tracked keywords" value={trackedKeywordCount} />
        <StatCard label="Top 10 rankings" value={pageOneKeywords} />
        <StatCard label="Top 20 rankings" value={topTwentyKeywords} />
        <StatCard
          label="Published pages"
          value={pageCounts.published}
          hint={`${pageCounts.total} total`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Top movers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="h-9 px-4 text-left font-medium">Keyword</th>
                  <th className="h-9 px-4 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {winners.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-muted-foreground text-center py-6"
                    >
                      No movement data yet
                    </td>
                  </tr>
                ) : (
                  winners.map((w) => (
                    <tr key={w.keywordId} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          className="hover:underline"
                          href={`/seo/keywords/${w.keywordId}`}
                        >
                          {w.keyword}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-medium text-emerald-600 tabular-nums">
                          +{w.delta}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Biggest drops
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="h-9 px-4 text-left font-medium">Keyword</th>
                  <th className="h-9 px-4 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {losers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-muted-foreground text-center py-6"
                    >
                      No movement data yet
                    </td>
                  </tr>
                ) : (
                  losers.map((l) => (
                    <tr key={l.keywordId} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          className="hover:underline"
                          href={`/seo/keywords/${l.keywordId}`}
                        >
                          {l.keyword}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-medium text-rose-600 tabular-nums">
                          {l.delta}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Coverage gaps
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Keywords with no snapshot in 14 days
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="h-9 px-4 text-left font-medium">Keyword</th>
                  <th className="h-9 px-4 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {staleKeywords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-muted-foreground text-center py-6"
                    >
                      All keywords up to date
                    </td>
                  </tr>
                ) : (
                  staleKeywords.slice(0, 8).map((k) => (
                    <tr key={k.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          className="hover:underline"
                          href={`/seo/keywords/${k.id}`}
                        >
                          {k.keyword}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {k.lastCapturedAt
                          ? formatDistanceToNow(fromUnix(k.lastCapturedAt), {
                              addSuffix: true,
                            })
                          : "never"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base font-medium">
              Keyword rankings
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Latest snapshot per keyword (top 30 by priority and current rank)
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            Weekly
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Keyword</th>
                <th className="h-9 px-4 text-left font-medium hidden md:table-cell">
                  Cluster
                </th>
                <th className="h-9 px-4 text-right font-medium">Rank</th>
                <th className="h-9 px-4 text-right font-medium">Δ</th>
                <th className="h-9 px-4 text-right font-medium hidden lg:table-cell">
                  Volume
                </th>
                <th className="h-9 px-4 text-left font-medium">Target</th>
                <th className="h-9 px-4 text-right font-medium hidden lg:table-cell">
                  Last seen
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No keywords tracked yet — add some via{" "}
                    <Link
                      href="/seo/keywords"
                      className="text-primary hover:underline"
                    >
                      Manage keywords
                    </Link>
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row.keywordId} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/seo/keywords/${row.keywordId}`}
                        className="hover:underline font-medium"
                      >
                        {row.keyword}
                      </Link>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {row.priority} priority · {row.intent ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                      {row.cluster ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatRank(row.latestPosition)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RankDelta
                        latest={row.latestPosition}
                        previous={row.previousPosition}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground hidden lg:table-cell tabular-nums">
                      {row.searchVolume ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {row.targetPath ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.targetPath}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground hidden lg:table-cell">
                      {row.latestCapturedAt
                        ? formatDistanceToNow(fromUnix(row.latestCapturedAt), {
                            addSuffix: true,
                          })
                        : "never"}
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
