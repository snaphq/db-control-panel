"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

export type ConfigSchemaProperty = {
  type: string;
  title?: string;
  description?: string;
  format?: string;
  enum?: string[];
  default?: unknown;
  items?: { type: string };
};

export type ConfigSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, ConfigSchemaProperty>;
};

interface InstallIntegrationFormProps {
  integrationSlug: string;
  integrationName: string;
  configSchema: ConfigSchema | null;
  /** Where to POST the install */
  installEndpoint: string;
  /** Where to redirect after success: `${baseHref}/${slug}/${installId}` */
  successHrefBase: string;
  defaultDisplayName?: string;
}

export function InstallIntegrationForm({
  integrationSlug,
  integrationName,
  configSchema,
  installEndpoint,
  successHrefBase,
  defaultDisplayName,
}: InstallIntegrationFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState(
    defaultDisplayName ?? integrationName,
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const props = configSchema?.properties ?? {};
    for (const [key, prop] of Object.entries(props)) {
      if (prop.default !== undefined) {
        init[key] = String(prop.default);
      }
    }
    return init;
  });

  const properties = configSchema?.properties ?? {};
  const required = new Set(configSchema?.required ?? []);

  function setField(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const config: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(properties)) {
        const raw = values[key];
        if (raw === undefined || raw === "") continue;
        if (prop.type === "object" || prop.type === "array") {
          try {
            config[key] = JSON.parse(raw);
          } catch {
            throw new Error(`'${key}' must be valid JSON.`);
          }
        } else {
          config[key] = raw;
        }
      }

      const res = await fetch(installEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationSlug,
          displayName: displayName.trim() || undefined,
          config,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? "Install failed");
      }
      toast.success(`${integrationName} installed`);
      router.push(`${successHrefBase}/${integrationSlug}/${payload.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={integrationName}
        />
      </div>

      {Object.entries(properties).map(([key, prop]) => {
        const id = `field-${key}`;
        const label = prop.title ?? key;
        const isRequired = required.has(key);

        if (prop.enum) {
          return (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={id}>
                {label}
                {isRequired && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={values[key] ?? ""}
                onValueChange={(v) => setField(key, v)}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {prop.enum.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {prop.description && (
                <p className="text-xs text-muted-foreground">
                  {prop.description}
                </p>
              )}
            </div>
          );
        }

        if (prop.type === "object" || prop.type === "array") {
          return (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={id}>
                {label}
                {isRequired && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea
                id={id}
                value={values[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={prop.type === "array" ? "[]" : "{}"}
                className="font-mono text-sm"
                rows={4}
              />
              {prop.description && (
                <p className="text-xs text-muted-foreground">
                  {prop.description} (JSON)
                </p>
              )}
            </div>
          );
        }

        const isPassword = prop.format === "password";
        return (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={id}>
              {label}
              {isRequired && <span className="text-destructive"> *</span>}
            </Label>
            <Input
              id={id}
              type={isPassword ? "password" : "text"}
              value={values[key] ?? ""}
              onChange={(e) => setField(key, e.target.value)}
              required={isRequired}
            />
            {prop.description && (
              <p className="text-xs text-muted-foreground">
                {prop.description}
              </p>
            )}
          </div>
        );
      })}

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Install
        </Button>
      </div>
    </form>
  );
}
