import { ensureSeoAccess } from "@/lib/seo-guard";
import { listEngines } from "@repo/database/dal/seo";
import { getShareOfVoice, getWeeklySpendCents } from "@repo/database/dal/seo";
import {
  findPromptsWithStaleSnapshots,
  listPrompts,
} from "@repo/database/dal/seo";
import { getSetting } from "@repo/durable-exec";
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
  title: "AIEO Dashboard",
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

function pct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

export default async function AieoDashboardPage() {
  await ensureSeoAccess("read");

  const [
    prompts,
    allPrompts,
    engines,
    sov7d,
    weekSpendCents,
    budgetUsd,
    stalePrompts,
  ] = await Promise.all([
    listPrompts({ activeOnly: true }),
    listPrompts(),
    listEngines(),
    getShareOfVoice({ sinceDays: 7 }),
    getWeeklySpendCents(),
    getSetting<number>("weeklyBudgetUsd"),
    findPromptsWithStaleSnapshots(14 * 86400),
  ]);

  const activeEngines = engines.filter((e) => e.isActive);
  const totalSnapshots = sov7d.reduce((a, r) => a + r.totalSnapshots, 0);
  const totalMentions = sov7d.reduce((a, r) => a + r.brandMentions, 0);
  const totalCitations = sov7d.reduce((a, r) => a + r.citations, 0);
  const mentionRate = totalSnapshots > 0 ? totalMentions / totalSnapshots : 0;
  const citationRate = totalSnapshots > 0 ? totalCitations / totalSnapshots : 0;

  const budgetCents = Math.round((budgetUsd ?? 5) * 100);
  const budgetUsedPct = budgetCents > 0 ? weekSpendCents / budgetCents : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            AIEO Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI Engine Optimization — track brand presence in LLM answers
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/seo/aieo/prompts"
            className="text-primary hover:underline"
          >
            Prompts →
          </Link>
          <Link
            href="/seo/aieo/engines"
            className="text-primary hover:underline"
          >
            Engines →
          </Link>
          <Link
            href="/seo/aieo/secrets"
            className="text-primary hover:underline"
          >
            Secrets →
          </Link>
          <Link
            href="/seo/aieo/settings"
            className="text-primary hover:underline"
          >
            Settings →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Active prompts"
          value={prompts.length}
          hint={`${allPrompts.length} total`}
        />
        <StatCard
          label="Active engines"
          value={activeEngines.length}
          hint={`${engines.length} configured`}
        />
        <StatCard
          label="Brand mention rate (7d)"
          value={pct(mentionRate)}
          hint={`${totalMentions} of ${totalSnapshots}`}
        />
        <StatCard
          label="Citation rate (7d)"
          value={pct(citationRate)}
          hint={`${totalCitations} citations`}
        />
        <StatCard
          label="Weekly spend"
          value={`$${(weekSpendCents / 100).toFixed(2)}`}
          hint={`of $${(budgetCents / 100).toFixed(2)} · ${pct(budgetUsedPct)}`}
        />
        <StatCard
          label="Stale prompts"
          value={stalePrompts.length}
          hint="no snapshot in 14d"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Per-engine share of voice (7d)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Engine</th>
                <th className="h-9 px-4 text-right font-medium">Snapshots</th>
                <th className="h-9 px-4 text-right font-medium">Mentions</th>
                <th className="h-9 px-4 text-right font-medium">
                  Mention rate
                </th>
                <th className="h-9 px-4 text-right font-medium">
                  Citation rate
                </th>
                <th className="h-9 px-4 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {sov7d.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No snapshots yet — set API keys in{" "}
                    <Link
                      href="/seo/aieo/secrets"
                      className="text-primary hover:underline"
                    >
                      /seo/aieo/secrets
                    </Link>{" "}
                    and trigger a run.
                  </td>
                </tr>
              ) : (
                sov7d.map((r) => (
                  <tr key={r.engineId} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.engineId}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.totalSnapshots}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.brandMentions}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {pct(r.brandMentionRate)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {pct(r.citationRate)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      ${(r.totalSpendCents / 100).toFixed(2)}
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
            <CardTitle className="text-base font-medium">Engines</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Configured AIEO engines and their model
            </p>
          </div>
          <Badge variant="outline">
            {activeEngines.length}/{engines.length} active
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Engine</th>
                <th className="h-9 px-4 text-left font-medium">Vendor</th>
                <th className="h-9 px-4 text-left font-medium">Model</th>
                <th className="h-9 px-4 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {engines.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center text-muted-foreground py-8"
                  >
                    No engines configured. Run seed-seo-engines.
                  </td>
                </tr>
              ) : (
                engines.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{e.label}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.vendor}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {e.modelId ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {e.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
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
