import { ensureSeoAccess } from "@repo/core/seo-guard";
import { listCitationSnapshots } from "@repo/database/dal/seo";
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
  title: "AIEO Citations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function sentimentVariant(
  s: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "positive") return "default";
  if (s === "negative") return "destructive";
  if (s === "neutral") return "secondary";
  return "outline";
}

function formatTs(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AieoCitationsPage() {
  await ensureSeoAccess("read");

  const citations = await listCitationSnapshots({
    sinceDays: 90,
    limit: 500,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            AIEO Citations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Snapshots where our URL was cited by an AI engine — last 90 days.
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
              Citation events
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Each row is a prompt snapshot where our URL appeared in citations
            </p>
          </div>
          <Badge variant="outline">{citations.length} events</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Date</th>
                <th className="h-9 px-4 text-left font-medium">Engine</th>
                <th className="h-9 px-4 text-left font-medium">Prompt</th>
                <th className="h-9 px-4 text-left font-medium">Cited URL</th>
                <th className="h-9 px-4 text-left font-medium">Sentiment</th>
                <th className="h-9 px-4 text-left font-medium">Mentioned</th>
              </tr>
            </thead>
            <tbody>
              {citations.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No citation events yet. Enable engines and run the weekly
                    cron to start collecting data.
                  </td>
                </tr>
              ) : (
                citations.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                      {formatTs(c.capturedAt)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {c.engineId}
                    </td>
                    <td
                      className="px-4 py-2 max-w-xs truncate"
                      title={c.promptText}
                    >
                      {c.promptText}
                    </td>
                    <td className="px-4 py-2 max-w-xs truncate">
                      <a
                        href={c.ourCitationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-mono text-xs"
                      >
                        {c.ourCitationUrl}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={sentimentVariant(c.sentiment)}>
                        {c.sentiment ?? "unknown"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      {c.brandMentioned ? (
                        <Badge variant="default">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
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
  );
}
