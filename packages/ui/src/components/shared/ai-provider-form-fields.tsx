"use client";

import { Loader2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export type AiProviderTestResult =
  | { ok: true; url: string; modelCount: number | null; source?: string }
  | {
      ok: false;
      error: string;
      url?: string;
      status?: number;
      source?: string;
    };

export function AiProviderBaseUrlField({
  value,
  onChange,
  placeholder = "https://api.openai.com/v1",
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="baseUrl">Base URL</Label>
      <Input
        id="baseUrl"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AiProviderApiKeyField({
  value,
  onChange,
  placeholder,
  hasApiKey,
  storedHint,
  clearLabel = "Clear key",
  clearing,
  onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hasApiKey: boolean;
  storedHint: string;
  clearLabel?: string;
  clearing: boolean;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="apiKey">API key</Label>
      <Input
        id="apiKey"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{storedHint}</p>
        {hasApiKey && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearing}
            className="text-xs text-destructive hover:underline"
          >
            {clearing ? "Clearing…" : clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function AiProviderDefaultModelField({
  value,
  onChange,
  placeholder = "gpt-4o-mini",
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="defaultModel">Default model</Label>
      <Input
        id="defaultModel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AiProviderTestResultPanel({
  result,
}: { result: AiProviderTestResult }) {
  return (
    <div
      className={
        result.ok
          ? "rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          : "rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      }
    >
      {result.ok ? (
        <>
          <div className="font-medium">
            Connection OK
            {result.source && (
              <span className="ml-1 text-xs opacity-70">
                (using {result.source} config)
              </span>
            )}
          </div>
          <div className="text-xs opacity-80">
            {result.url}
            {result.modelCount !== null
              ? ` · ${result.modelCount} models returned`
              : ""}
          </div>
        </>
      ) : (
        <>
          <div className="font-medium">
            Connection failed{result.status ? ` (HTTP ${result.status})` : ""}
          </div>
          <div className="break-words text-xs opacity-80">{result.error}</div>
          {result.url && <div className="text-xs opacity-60">{result.url}</div>}
        </>
      )}
    </div>
  );
}
