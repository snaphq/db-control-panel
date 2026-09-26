import { AddKeywordForm } from "@/app/(admin)/seo/keywords/AddKeywordForm";
import { KeywordRowActions } from "@/app/(admin)/seo/keywords/KeywordRowActions";
import { ensureSeoAccess } from "@/lib/seo-guard";
import { listKeywords } from "@repo/database/dal/seo";
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
  title: "SEO Keywords",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fromUnix(unix: number): Date {
  return new Date(unix * 1000);
}

export default async function SeoKeywordsPage() {
  await ensureSeoAccess("read");

  const keywords = await listKeywords();
  const active = keywords.filter((k) => k.isActive);
  const archived = keywords.filter((k) => !k.isActive);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Keywords</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {active.length} active · {archived.length} archived
          </p>
        </div>
        <Link href="/seo" className="text-sm text-primary hover:underline">
          ← Back to overview
        </Link>
      </div>

      <AddKeywordForm />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">All keywords</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Keyword</th>
                <th className="h-9 px-4 text-left font-medium hidden md:table-cell">
                  Cluster
                </th>
                <th className="h-9 px-4 text-left font-medium hidden md:table-cell">
                  Intent
                </th>
                <th className="h-9 px-4 text-left font-medium">Priority</th>
                <th className="h-9 px-4 text-right font-medium hidden lg:table-cell">
                  Volume
                </th>
                <th className="h-9 px-4 text-left font-medium hidden lg:table-cell">
                  Target
                </th>
                <th className="h-9 px-4 text-left font-medium">Status</th>
                <th className="h-9 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No keywords yet — add one above to start tracking.
                  </td>
                </tr>
              ) : (
                keywords.map((k) => (
                  <tr key={k.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/seo/keywords/${k.id}`}
                        className="font-medium hover:underline"
                      >
                        {k.keyword}
                      </Link>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        added{" "}
                        {formatDistanceToNow(fromUnix(k.createdAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                      {k.cluster ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell capitalize">
                      {k.intent ?? "—"}
                    </td>
                    <td className="px-4 py-2 capitalize">
                      {k.priority ?? "medium"}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground hidden lg:table-cell tabular-nums">
                      {k.searchVolume ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs hidden lg:table-cell">
                      {k.targetPath ? (
                        <span className="font-mono text-muted-foreground">
                          {k.targetPath}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {k.isActive ? (
                        <Badge variant="default">active</Badge>
                      ) : (
                        <Badge variant="outline">archived</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <KeywordRowActions id={k.id} isActive={k.isActive} />
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
