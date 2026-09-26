import { CompetitorRowActions } from "@/app/(admin)/seo/aieo/competitors/CompetitorRowActions";
import { ReinferButton } from "@/app/(admin)/seo/aieo/competitors/ReinferButton";
import { ensureSeoAccess } from "@/lib/seo-guard";
import { listCompetitors } from "@repo/database/dal/seo";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AIEO Competitors",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fromUnix(unix: number): Date {
  return new Date(unix * 1000);
}

export default async function AieoCompetitorsPage() {
  await ensureSeoAccess("read");
  const competitors = await listCompetitors({ includeExcluded: true });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            AIEO Competitors
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auto-inferred from snapshot citations. Pin or exclude domains to
            refine the list.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <ReinferButton />
          <Link
            href="/seo/aieo"
            className="text-sm text-primary hover:underline"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            All competitors
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Domain</th>
                <th className="h-9 px-4 text-right font-medium">Mentions</th>
                <th className="h-9 px-4 text-left font-medium">First seen</th>
                <th className="h-9 px-4 text-left font-medium">Tags</th>
                <th className="h-9 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {competitors.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No competitors yet. Run the prompt-snapshot cron a few times
                    then re-infer.
                  </td>
                </tr>
              ) : (
                competitors.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{c.domain}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {c.mentionCount}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(fromUnix(c.firstSeenAt), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="px-4 py-2 space-x-1">
                      {c.isManual ? <Badge>Pinned</Badge> : null}
                      {c.isExcluded ? (
                        <Badge variant="destructive">Excluded</Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <CompetitorRowActions
                        id={c.id}
                        isManual={c.isManual}
                        isExcluded={c.isExcluded}
                      />
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
