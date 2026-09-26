"use client";

import {
  CategoryStatusRow,
  DescriptionField,
  IconDocsUrlRow,
  JsonTextareaField,
  NameField,
  ResourceFormActions,
  SlugField,
  SystemManagedCheckbox,
  parseJsonField,
} from "@/components/admin/resource-form-fields";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  "outreach",
  "research",
  "support",
  "sales",
  "other",
] as const;

export type AgentFormInitial = {
  id?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  category?: string;
  iconUrl?: string | null;
  docsUrl?: string | null;
  status?: string;
  isSystemManaged?: boolean;
  systemPrompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  configSchema?: unknown;
  metadata?: unknown;
};

interface Props {
  mode: "create" | "edit";
  initial?: AgentFormInitial;
}

export function AgentForm({ mode, initial }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "other");
  const [iconUrl, setIconUrl] = useState(initial?.iconUrl ?? "");
  const [docsUrl, setDocsUrl] = useState(initial?.docsUrl ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [isSystemManaged, setIsSystemManaged] = useState(
    initial?.isSystemManaged ?? false,
  );
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [temperature, setTemperature] = useState(
    initial?.temperature != null ? String(initial.temperature) : "",
  );
  const [configSchemaText, setConfigSchemaText] = useState(
    initial?.configSchema
      ? JSON.stringify(initial.configSchema, null, 2)
      : "{}",
  );
  const [metadataText, setMetadataText] = useState(
    initial?.metadata ? JSON.stringify(initial.metadata, null, 2) : "{}",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const configSchema = parseJsonField(configSchemaText, "configSchema");
      const metadata = parseJsonField(metadataText, "metadata");

      let temperatureValue: number | null = null;
      if (temperature.trim()) {
        const parsed = Number(temperature);
        if (!Number.isFinite(parsed))
          throw new Error("temperature must be a number");
        temperatureValue = parsed;
      }

      const body = {
        ...(mode === "create" ? { slug } : {}),
        name,
        description: description || null,
        category,
        iconUrl: iconUrl || null,
        docsUrl: docsUrl || null,
        status,
        isSystemManaged,
        systemPrompt: systemPrompt || null,
        model: model || null,
        temperature: temperatureValue,
        configSchema,
        metadata,
      };

      const url =
        mode === "create"
          ? "/api/admin/agents"
          : `/api/admin/agents/${initial?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Save failed");
      toast.success(mode === "create" ? "Agent created" : "Saved");
      if (mode === "create") router.push(`/agents/${payload.id}`);
      else router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/agents/${initial.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Delete failed");
      toast.success("Agent deleted");
      router.push("/agents");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <SlugField
        value={slug}
        onChange={setSlug}
        disabled={mode === "edit"}
        placeholder="outreach-writer"
      />
      <NameField value={name} onChange={setName} />
      <DescriptionField value={description ?? ""} onChange={setDescription} />
      <CategoryStatusRow
        categories={CATEGORIES}
        category={category}
        onCategoryChange={setCategory}
        status={status}
        onStatusChange={setStatus}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="systemPrompt">System prompt</Label>
        <Textarea
          id="systemPrompt"
          value={systemPrompt ?? ""}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          placeholder="You are a helpful assistant that…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={model ?? ""}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini (leave blank to use default)"
          />
          <p className="text-xs text-muted-foreground">
            Overrides the global OPENAI_DEFAULT_MODEL when set.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="temperature">Temperature</Label>
          <Input
            id="temperature"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="0.7"
          />
        </div>
      </div>

      <IconDocsUrlRow
        iconUrl={iconUrl ?? ""}
        onIconUrlChange={setIconUrl}
        docsUrl={docsUrl ?? ""}
        onDocsUrlChange={setDocsUrl}
      />
      <SystemManagedCheckbox
        checked={isSystemManaged}
        onChange={setIsSystemManaged}
        label="System managed (cannot be removed by users)"
      />
      <JsonTextareaField
        id="configSchema"
        label="Config schema (JSON)"
        value={configSchemaText}
        onChange={setConfigSchemaText}
        rows={8}
      />
      <JsonTextareaField
        id="metadata"
        label="Metadata (JSON)"
        value={metadataText}
        onChange={setMetadataText}
        rows={6}
      />
      <ResourceFormActions
        mode={mode}
        submitting={submitting}
        deleting={deleting}
        deleteTitle="Delete this agent?"
        deleteDescription="This action cannot be undone."
        onDelete={handleDelete}
      />
    </form>
  );
}
