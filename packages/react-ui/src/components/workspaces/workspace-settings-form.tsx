"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";

interface WorkspaceSettingsFormProps {
  organizationId: string;
  initialName: string;
  initialSlug: string;
  role: string;
  canEdit: boolean;
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function WorkspaceSettingsForm({
  organizationId,
  initialName,
  initialSlug,
  role,
  canEdit,
}: WorkspaceSettingsFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);

  const [slug, setSlug] = useState(initialSlug);
  const [savedSlug, setSavedSlug] = useState(initialSlug);
  const [savingSlug, setSavingSlug] = useState(false);

  const [copied, setCopied] = useState(false);

  const trimmedName = name.trim();
  const nameDirty = trimmedName !== savedName;
  const nameValid = trimmedName.length >= 2;

  const slugDirty = slug !== savedSlug;
  const slugValid = SLUG_REGEX.test(slug);

  async function update(field: "name" | "slug", value: string) {
    const res = await fetch(`/api/organizations/${savedSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error ?? "Failed to update workspace");
    }
    return payload as { slug: string };
  }

  async function handleSaveName() {
    if (!nameDirty || !nameValid) return;
    setSavingName(true);
    try {
      await update("name", trimmedName);
      setSavedName(trimmedName);
      toast.success("Workspace name updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveSlug() {
    if (!slugDirty || !slugValid) return;
    setSavingSlug(true);
    try {
      const updated = await update("slug", slug);
      setSavedSlug(updated.slug);
      toast.success("Workspace slug updated. Redirecting…");
      router.replace(`/dashboard/${updated.slug}/~/settings`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingSlug(false);
    }
  }

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(organizationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Workspace Name */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Name</CardTitle>
          <CardDescription>
            Display name shown in the sidebar and switcher.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            className="max-w-xl"
            placeholder="Acme Inc."
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "Use 2 characters or more."
              : "Only owners and admins can edit workspace settings."}
          </p>
          <Button
            size="sm"
            onClick={handleSaveName}
            disabled={!canEdit || !nameDirty || !nameValid || savingName}
          >
            {savingName && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Workspace Slug */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Slug</CardTitle>
          <CardDescription>
            Used in URLs. Changing this will break existing bookmarks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring max-w-xl">
            <span className="flex items-center px-3 bg-muted text-muted-foreground text-sm border-r border-input whitespace-nowrap">
              /dashboard/
            </span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canEdit}
              className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder={initialSlug}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Lowercase letters, numbers, and dashes.
          </p>
          <Button
            size="sm"
            onClick={handleSaveSlug}
            disabled={!canEdit || !slugDirty || !slugValid || savingSlug}
          >
            {savingSlug && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Workspace ID */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace ID</CardTitle>
          <CardDescription>Used when interacting with the API.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 max-w-md font-mono text-sm">
            <span className="flex-1 truncate">{organizationId}</span>
            <button
              type="button"
              onClick={handleCopyId}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Copy workspace ID"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">Your role</p>
          <Badge variant="outline" className="capitalize">
            {role}
          </Badge>
        </CardFooter>
      </Card>
    </div>
  );
}
