"use client";

import {
  AiProviderApiKeyField,
  AiProviderBaseUrlField,
  AiProviderDefaultModelField,
  type AiProviderTestResult,
  AiProviderTestResultPanel,
} from "@repo/ui/components/shared/ai-provider-form-fields";
import { Button } from "@repo/ui/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Initial = {
  baseUrl: string | null;
  apiKeyLast4: string | null;
  hasApiKey: boolean;
  defaultModel: string | null;
};

interface Props {
  initial: Initial;
}

export function AiProviderForm({ initial }: Props) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        baseUrl: baseUrl.trim() || null,
        defaultModel: defaultModel.trim() || null,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await fetch("/api/admin/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Save failed");
      toast.success("AI provider settings saved");
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
      const res = await fetch("/api/admin/ai-provider", { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Failed to clear key");
      toast.success("API key cleared");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear key");
    } finally {
      setClearing(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai-provider/test", {
        method: "POST",
      });
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
    : "sk-…";

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <AiProviderBaseUrlField
        value={baseUrl}
        onChange={setBaseUrl}
        hint="Optional. Leave blank to use the provider default. Use an approved HTTPS OpenAI-compatible endpoint (e.g. Azure, vLLM, Groq); production hosts must be allowlisted."
      />
      <AiProviderApiKeyField
        value={apiKey}
        onChange={setApiKey}
        placeholder={keyPlaceholder}
        hasApiKey={initial.hasApiKey}
        storedHint={
          initial.hasApiKey
            ? "Stored encrypted. Leave blank to keep the current key."
            : "Not configured."
        }
        clearing={clearing}
        onClear={handleClearKey}
      />
      <AiProviderDefaultModelField
        value={defaultModel}
        onChange={setDefaultModel}
        hint="Used when an agent doesn't specify its own model."
      />

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={testing || !initial.hasApiKey}
          title={
            initial.hasApiKey ? undefined : "Save an API key before testing"
          }
        >
          {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Test connection
        </Button>
      </div>

      {testResult && <AiProviderTestResultPanel result={testResult} />}
    </form>
  );
}
