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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORIES = ["email", "crm", "analytics", "tools", "other"] as const;

export type IntegrationFormInitial = {
  id?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  category?: string;
  iconUrl?: string | null;
  docsUrl?: string | null;
  status?: string;
  isSystemManaged?: boolean;
  configSchema?: unknown;
  metadata?: unknown;
};

interface Props {
  mode: "create" | "edit";
  initial?: IntegrationFormInitial;
  installCount?: number;
}

export function IntegrationForm({ mode, initial, installCount = 0 }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "tools");
  const [iconUrl, setIconUrl] = useState(initial?.iconUrl ?? "");
  const [docsUrl, setDocsUrl] = useState(initial?.docsUrl ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [isSystemManaged, setIsSystemManaged] = useState(
    initial?.isSystemManaged ?? false,
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

      const body = {
        ...(mode === "create" ? { slug } : {}),
        name,
        description: description || null,
        category,
        iconUrl: iconUrl || null,
        docsUrl: docsUrl || null,
        status,
        isSystemManaged,
        configSchema,
        metadata,
      };

      const url =
        mode === "create"
          ? "/api/admin/integrations"
          : `/api/admin/integrations/${initial?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Save failed");
      toast.success(mode === "create" ? "Integration created" : "Saved");
      if (mode === "create") router.push(`/integrations/${payload.id}`);
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
      const res = await fetch(`/api/admin/integrations/${initial.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Delete failed");
      toast.success("Integration deleted");
      router.push("/integrations");
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
        placeholder="custom-mcp-server"
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
      <IconDocsUrlRow
        iconUrl={iconUrl ?? ""}
        onIconUrlChange={setIconUrl}
        docsUrl={docsUrl ?? ""}
        onDocsUrlChange={setDocsUrl}
      />
      <SystemManagedCheckbox
        checked={isSystemManaged}
        onChange={setIsSystemManaged}
        label="System managed (cannot be uninstalled by users)"
      />
      <JsonTextareaField
        id="configSchema"
        label="Config schema (JSON)"
        value={configSchemaText}
        onChange={setConfigSchemaText}
        rows={10}
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
        deleteDisabled={installCount > 0}
        deleteTitle="Delete this integration?"
        deleteDescription={
          installCount > 0
            ? `Cannot delete: ${installCount} installation(s) exist.`
            : "This action cannot be undone."
        }
        onDelete={handleDelete}
      />
    </form>
  );
}
