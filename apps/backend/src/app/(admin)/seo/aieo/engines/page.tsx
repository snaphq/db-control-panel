import { EngineRow } from "@/app/(admin)/seo/aieo/engines/EngineRow";
import { ensureSeoAccess } from "@/lib/seo-guard";
import { listEngines } from "@repo/database/dal/seo";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AIEO Engines",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AieoEnginesPage() {
  await ensureSeoAccess("read");
  const engines = await listEngines();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">AIEO Engines</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Toggle engines on/off and adjust the model used per engine.
          </p>
        </div>
        <Link href="/seo/aieo" className="text-sm text-primary hover:underline">
          ← Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">All engines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Engine</th>
                <th className="h-9 px-4 text-left font-medium">Vendor</th>
                <th className="h-9 px-4 text-left font-medium">Model ID</th>
                <th className="h-9 px-4 text-right font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {engines.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center text-muted-foreground py-8"
                  >
                    No engines configured. Run the seed-seo-engines script.
                  </td>
                </tr>
              ) : (
                engines.map((e) => <EngineRow key={e.id} engine={e} />)
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
