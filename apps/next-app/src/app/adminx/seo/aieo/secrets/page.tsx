import { ensureSeoAccess } from "@repo/core/seo-guard";
import { type AieoSecretKey, listMaskedSecrets } from "@repo/durable-exec";
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
import { SecretRowActions } from "./SecretRowActions";
import { SetSecretForm } from "./SetSecretForm";
import { ValidateAllButton } from "./ValidateAllButton";

export const metadata: Metadata = {
  title: "AIEO Secrets",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ALL_KEYS: AieoSecretKey[] = [
  "PERPLEXITY_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DATAFORSEO_AUTH",
  "POSTHOG_API_KEY",
];

function fromUnix(unix: number): Date {
  return new Date(unix * 1000);
}

export default async function AieoSecretsPage() {
  await ensureSeoAccess("read");
  const stored = await listMaskedSecrets();
  const byKey = new Map(stored.map((s) => [s.key, s]));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">AIEO Secrets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Vendor API keys, encrypted at rest with AIEO_ENCRYPTION_KEY.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ValidateAllButton />
          <Link
            href="/adminx/seo/aieo"
            className="text-sm text-primary hover:underline"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Set or rotate a key
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SetSecretForm allKeys={ALL_KEYS} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Stored credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="h-9 px-4 text-left font-medium">Key</th>
                <th className="h-9 px-4 text-left font-medium">Value</th>
                <th className="h-9 px-4 text-left font-medium">Status</th>
                <th className="h-9 px-4 text-left font-medium">Last set</th>
                <th className="h-9 px-4 text-left font-medium">
                  Last validated
                </th>
                <th className="h-9 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ALL_KEYS.map((k) => {
                const s = byKey.get(k);
                if (!s) {
                  return (
                    <tr key={k} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{k}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        — not set —
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">Not set</Badge>
                      </td>
                      <td className="px-4 py-2" colSpan={3} />
                    </tr>
                  );
                }
                const status = s.lastValidationStatus;
                return (
                  <tr key={k} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{k}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {s.maskedValue}
                    </td>
                    <td className="px-4 py-2">
                      {status === "ok" ? (
                        <Badge>Valid</Badge>
                      ) : status === "failed" ? (
                        <Badge
                          variant="destructive"
                          title={s.lastValidationError ?? ""}
                        >
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline">Unverified</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(fromUnix(s.lastSetAt), {
                        addSuffix: true,
                      })}
                      {s.lastSetBy ? (
                        <div className="text-[10px]">by {s.lastSetBy}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {s.lastValidatedAt
                        ? formatDistanceToNow(fromUnix(s.lastValidatedAt), {
                            addSuffix: true,
                          })
                        : "never"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <SecretRowActions secretKey={k} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
