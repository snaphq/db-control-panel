import { ensureSeoAccess } from "@repo/core/seo-guard";
import { listPrompts } from "@repo/database/dal/seo";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { AddPromptForm } from "./AddPromptForm";
import { PromptRowActions } from "./PromptRowActions";

export const metadata: Metadata = {
  title: "AIEO Prompts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AieoPromptsPage() {
  await ensureSeoAccess("read");
  const prompts = await listPrompts();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">AIEO Prompts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage the prompts the AIEO crons run against each engine.
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Add prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <AddPromptForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base font-medium">All prompts</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Active prompts are queried weekly across all active engines.
            </p>
          </div>
          <Badge variant="outline">{prompts.length} total</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Prompt</th>
                <th className="h-9 px-4 text-left font-medium">Cluster</th>
                <th className="h-9 px-4 text-left font-medium">Intent</th>
                <th className="h-9 px-4 text-left font-medium">Priority</th>
                <th className="h-9 px-4 text-left font-medium">Status</th>
                <th className="h-9 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No prompts yet. Add one above or run the seed script.
                  </td>
                </tr>
              ) : (
                prompts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2 max-w-md">{p.prompt}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.cluster ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.intent ?? "—"}
                    </td>
                    <td className="px-4 py-2">{p.priority}</td>
                    <td className="px-4 py-2">
                      {p.isActive ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <PromptRowActions id={p.id} isActive={p.isActive} />
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
