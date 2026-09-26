import { KeywordRowActions } from "@/app/(admin)/seo/keywords/KeywordRowActions";
import { KeywordPositionChart } from "@/app/(admin)/seo/keywords/[id]/KeywordPositionChart";
import { ensureSeoAccess } from "@/lib/seo-guard";
import { getKeywordById } from "@repo/database/dal/seo";
import { listSnapshotsForKeyword } from "@repo/database/dal/seo";
import { Badge } from "@repo/react-ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fromUnix(unix: number): Date {
  return new Date(unix * 1000);
}

export default async function KeywordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureSeoAccess("read");
  const { id } = await params;

  const keyword = await getKeywordById(id);
  if (!keyword) notFound();

  const snapshots = await listSnapshotsForKeyword(id, { limit: 52 });

  const chartData = [...snapshots].reverse().map((s) => ({
    date: format(fromUnix(s.capturedAt), "MMM d"),
    position: s.position,
  }));

  const urlChanges: Array<{
    date: number;
    from: string | null;
    to: string | null;
  }> = [];
  for (let i = 0; i < snapshots.length - 1; i++) {
    const newer = snapshots[i];
    const older = snapshots[i + 1];
    if ((newer.rankingUrl ?? null) !== (older.rankingUrl ?? null)) {
      urlChanges.push({
        date: newer.capturedAt,
        from: older.rankingUrl,
        to: newer.rankingUrl,
      });
    }
  }

  const latest = snapshots[0];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/seo/keywords"
            className="text-sm text-primary hover:underline"
          >
            ← All keywords
          </Link>
          <h1 className="text-2xl font-normal tracking-tight mt-1">
            {keyword.keyword}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {keyword.cluster ?? "—"} · {keyword.intent ?? "—"} ·{" "}
            {keyword.priority ?? "medium"} priority
            {keyword.isActive ? null : (
              <Badge variant="outline" className="ml-2">
                archived
              </Badge>
            )}
          </p>
        </div>
        <KeywordRowActions id={keyword.id} isActive={keyword.isActive} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Current rank
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {latest?.position ? `#${latest.position}` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Search volume
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {keyword.searchVolume ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Difficulty
            </p>
            <p className="mt-2 text-2xl font-semibold capitalize">
              {keyword.difficulty ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Snapshots
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {snapshots.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Position over time
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Lower is better. Y-axis is inverted so the line trends up when
            ranking improves.
          </p>
        </CardHeader>
        <CardContent>
          <KeywordPositionChart data={chartData} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Recent snapshots
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="h-9 px-4 text-left font-medium">When</th>
                  <th className="h-9 px-4 text-right font-medium">Rank</th>
                  <th className="h-9 px-4 text-left font-medium">Source</th>
                  <th className="h-9 px-4 text-left font-medium">
                    Ranking URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-muted-foreground text-center py-6"
                    >
                      No snapshots yet
                    </td>
                  </tr>
                ) : (
                  snapshots.slice(0, 12).map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {format(fromUnix(s.capturedAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {s.position ? `#${s.position}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {s.source}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {s.rankingUrl ? (
                          <a
                            href={s.rankingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1 font-mono"
                          >
                            {s.rankingUrl}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
              Ranking URL changes
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              When Google starts ranking a different page for this keyword
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="h-9 px-4 text-left font-medium">When</th>
                  <th className="h-9 px-4 text-left font-medium">From</th>
                  <th className="h-9 px-4 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {urlChanges.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-muted-foreground text-center py-6"
                    >
                      No URL changes detected
                    </td>
                  </tr>
                ) : (
                  urlChanges.slice(0, 8).map((c) => (
                    <tr key={c.date} className="border-b last:border-0">
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {format(fromUnix(c.date), "MMM d")}
                      </td>
                      <td className="px-4 py-2 text-xs font-mono">
                        {c.from ?? (
                          <span className="text-muted-foreground">none</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs font-mono">
                        {c.to ?? (
                          <span className="text-muted-foreground">none</span>
                        )}
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="grid grid-cols-2 gap-y-2 gap-x-4">
            <dt className="text-muted-foreground">Target path</dt>
            <dd className="font-mono text-xs">{keyword.targetPath ?? "—"}</dd>
            <dt className="text-muted-foreground">Cluster</dt>
            <dd>{keyword.cluster ?? "—"}</dd>
            <dt className="text-muted-foreground">Intent</dt>
            <dd className="capitalize">{keyword.intent ?? "—"}</dd>
            <dt className="text-muted-foreground">Priority</dt>
            <dd className="capitalize">{keyword.priority ?? "medium"}</dd>
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="capitalize">{keyword.difficulty ?? "—"}</dd>
            <dt className="text-muted-foreground">Search volume</dt>
            <dd className="tabular-nums">{keyword.searchVolume ?? "—"}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-muted-foreground">
              {format(fromUnix(keyword.createdAt), "yyyy-MM-dd")}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
