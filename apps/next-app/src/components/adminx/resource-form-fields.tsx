"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Loader2 } from "lucide-react";

export const RESOURCE_STATUSES = [
  "active",
  "beta",
  "deprecated",
  "hidden",
] as const;

export function SlugField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="slug">Slug</Label>
      <Input
        id="slug"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        pattern="[a-z0-9-]+"
        placeholder={placeholder}
      />
      <p className="text-xs text-muted-foreground">
        Lowercase letters, numbers, and dashes. Cannot be changed after
        creation.
      </p>
    </div>
  );
}

export function NameField({
  value,
  onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="name">Name</Label>
      <Input
        id="name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </div>
  );
}

export function DescriptionField({
  value,
  onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="description">Description</Label>
      <Textarea
        id="description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </div>
  );
}

export function CategoryStatusRow({
  categories,
  category,
  onCategoryChange,
  status,
  onStatusChange,
}: {
  categories: readonly string[];
  category: string;
  onCategoryChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function IconDocsUrlRow({
  iconUrl,
  onIconUrlChange,
  docsUrl,
  onDocsUrlChange,
}: {
  iconUrl: string;
  onIconUrlChange: (v: string) => void;
  docsUrl: string;
  onDocsUrlChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="iconUrl">Icon URL</Label>
        <Input
          id="iconUrl"
          value={iconUrl}
          onChange={(e) => onIconUrlChange(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="docsUrl">Docs URL</Label>
        <Input
          id="docsUrl"
          value={docsUrl}
          onChange={(e) => onDocsUrlChange(e.target.value)}
          placeholder="https://…"
        />
      </div>
    </div>
  );
}

export function SystemManagedCheckbox({
  checked,
  onChange,
  label = "System managed (cannot be removed by users)",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function JsonTextareaField({
  id,
  label,
  value,
  onChange,
  rows = 6,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="font-mono text-xs"
      />
    </div>
  );
}

export function ResourceFormActions({
  mode,
  submitting,
  deleting,
  deleteDisabled,
  deleteTitle,
  deleteDescription,
  onDelete,
}: {
  mode: "create" | "edit";
  submitting: boolean;
  deleting: boolean;
  deleteDisabled?: boolean;
  deleteTitle: string;
  deleteDescription: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {mode === "create" ? "Create" : "Save changes"}
      </Button>
      {mode === "edit" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteDisabled || deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={deleteDisabled} onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export function parseJsonField(text: string, fieldName: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${fieldName} must be valid JSON`);
  }
}
