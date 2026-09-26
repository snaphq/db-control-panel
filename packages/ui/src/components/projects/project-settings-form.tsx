"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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

interface ProjectSettingsFormProps {
  projectId: string;
  initialName: string;
  workspaceSlug: string;
  currentSlug: string;
}

export function ProjectSettingsForm({
  projectId,
  initialName,
  workspaceSlug,
  currentSlug,
}: ProjectSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== savedName;
  const valid = trimmed.length >= 2;

  async function handleSave() {
    if (!dirty || !valid) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update project");
      }
      setSavedName(trimmed);
      toast.success("Project name updated");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update project",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(projectId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Project Name */}
      <Card>
        <CardHeader>
          <CardTitle>Project Name</CardTitle>
          <CardDescription>
            Used to identify your Project on the Dashboard and in the URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring max-w-xl">
            <span className="flex items-center px-3 bg-muted text-muted-foreground text-sm border-r border-input whitespace-nowrap">
              /{workspaceSlug}/
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder={currentSlug}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Learn more about{" "}
            <a
              href="https://opencode.ai/docs"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Project Name
            </a>
          </p>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || !valid || isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Project ID (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle>Project ID</CardTitle>
          <CardDescription>Used when interacting with the API.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 max-w-md font-mono text-sm">
            <span className="flex-1 truncate">{projectId}</span>
            <button
              type="button"
              onClick={handleCopyId}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Copy project ID"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </CardContent>
        <CardFooter className="border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Learn more about{" "}
            <a
              href="https://opencode.ai/docs"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Project ID
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
