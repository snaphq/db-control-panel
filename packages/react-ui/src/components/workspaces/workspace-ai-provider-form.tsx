"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AiProviderApiKeyField,
  AiProviderBaseUrlField,
  AiProviderDefaultModelField,
  type AiProviderTestResult,
  AiProviderTestResultPanel,
} from "../shared/ai-provider-form-fields";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

type Initial = {
  baseUrl: string | null;
  apiKeyLast4: string | null;
  hasApiKey: boolean;
  defaultModel: string | null;
  hasOrgOverride: boolean;
};

interface Props {
  organizationId: string;
  initial: Initial;
}

export function WorkspaceAiProviderForm({ organizationId, initial }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiProviderTestResult | null>(
    null,
  );

  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState(initial.defaultModel ?? "");

  const orgApiUrl = `/api/organizations/${organizationId}/ai-provider`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        baseUrl: baseUrl.trim() || null,
        defaultModel: defaultModel.trim() || null,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await fetch(orgApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Save failed");
      toast.success("Workspace AI provider saved");
      setApiKey("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearKey() {
    setClearing(true);
    try {
      const res = await fetch(orgApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearApiKey: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Failed to clear key");
      toast.success("Workspace API key cleared");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear key");
    } finally {
      setClearing(false);
    }
  }

  async function handleResetAll() {
    if (
      !confirm(
        "Remove all workspace overrides? Agents will fall back to the platform-wide provider.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch(orgApiUrl, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Failed to reset");
      toast.success("Overrides removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setClearing(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(orgApiUrl, { method: "PUT" });
      const raw = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok && typeof raw.ok !== "boolean") {
        throw new Error(
          typeof raw.error === "string" ? raw.error : "Test failed",
        );
      }
      const payload = raw as unknown as AiProviderTestResult;
      setTestResult(payload);
      if (payload.ok) toast.success("Connection OK");
      else toast.error(payload.error || "Connection failed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test failed";
      setTestResult({ ok: false, error: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  const keyPlaceholder = initial.hasApiKey
    ? `sk-••••••••${initial.apiKeyLast4 ?? ""} (leave blank to keep)`
    : "Use platform key (leave blank) or paste sk-…";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">OpenAI configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <AiProviderBaseUrlField
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="Leave blank to use platform default"
          />
          <AiProviderApiKeyField
            value={apiKey}
            onChange={setApiKey}
            placeholder={keyPlaceholder}
            hasApiKey={initial.hasApiKey}
            storedHint={
              initial.hasApiKey
                ? "Stored encrypted. Leave blank to keep the current key."
                : "Not set — agents will use the platform-wide key."
            }
            clearLabel="Clear workspace key"
            clearing={clearing}
            onClear={handleClearKey}
          />
          <AiProviderDefaultModelField
            value={defaultModel}
            onChange={setDefaultModel}
            placeholder="Leave blank to use platform default"
          />

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save overrides
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testing}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test connection
            </Button>
            {initial.hasOrgOverride && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleResetAll}
                disabled={clearing}
                className="ml-auto text-destructive hover:text-destructive"
              >
                Reset all overrides
              </Button>
            )}
          </div>

          {testResult && <AiProviderTestResultPanel result={testResult} />}
        </form>
      </CardContent>
    </Card>
  );
}
