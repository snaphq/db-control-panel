import { SettingForm } from "@/app/(admin)/seo/aieo/settings/SettingForm";
import { ensureSeoAccess } from "@/lib/seo-guard";
import { listSettings } from "@repo/durable-exec";
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
  title: "AIEO Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TYPES: Record<string, "string" | "number" | "array"> = {
  weeklyBudgetUsd: "number",
  sentimentModel: "string",
  targetDomain: "string",
  noiseDomains: "array",
  posthogProjectId: "string",
  posthogHost: "string",
};

function fromUnix(unix: number): Date {
  return new Date(unix * 1000);
}

export default async function AieoSettingsPage() {
  await ensureSeoAccess("read");
  const settings = await listSettings();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">AIEO Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Global config for the AIEO subsystem (budget, models, target domain,
            noise filter).
          </p>
        </div>
        <Link href="/seo/aieo" className="text-sm text-primary hover:underline">
          ← Dashboard
        </Link>
      </div>

      {settings.map((s) => {
        const type = TYPES[s.key] ?? "string";
        const display =
          type === "array"
            ? JSON.stringify(s.value, null, 2)
            : String(s.value ?? "");
        return (
          <Card key={s.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium font-mono">
                {s.key}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {s.updatedAt
                  ? `Updated ${formatDistanceToNow(fromUnix(s.updatedAt), {
                      addSuffix: true,
                    })} by ${s.updatedBy ?? "system"}`
                  : "default value"}
              </p>
            </CardHeader>
            <CardContent>
              <SettingForm
                settingKey={s.key}
                type={type}
                initialValue={display}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
