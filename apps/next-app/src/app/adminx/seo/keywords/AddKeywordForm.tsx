"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useState, useTransition } from "react";
import { createKeywordAction } from "./actions";

export function AddKeywordForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createKeywordAction(formData);
      if (!res.ok) {
        setError(res.message ?? "Failed to add keyword");
      } else {
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Add keyword
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form
          action={onSubmit}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
            <Label htmlFor="keyword">Keyword *</Label>
            <Input
              id="keyword"
              name="keyword"
              required
              placeholder="e.g. app review monitoring"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cluster">Cluster</Label>
            <Input
              id="cluster"
              name="cluster"
              placeholder="core-product / comparison / integration"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intent">Intent</Label>
            <Select name="intent" defaultValue="informational">
              <SelectTrigger id="intent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="informational">informational</SelectItem>
                <SelectItem value="transactional">transactional</SelectItem>
                <SelectItem value="comparison">comparison</SelectItem>
                <SelectItem value="navigational">navigational</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Select name="priority" defaultValue="medium">
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="low">low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="targetPath">Target path</Label>
            <Input
              id="targetPath"
              name="targetPath"
              placeholder="/blog/your-page"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="searchVolume">Search volume</Label>
            <Input
              id="searchVolume"
              name="searchVolume"
              type="number"
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select name="difficulty" defaultValue="medium">
              <SelectTrigger id="difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p className="sm:col-span-2 lg:col-span-3 text-sm text-rose-600">
              {error}
            </p>
          ) : null}
          <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Adding..." : "Add keyword"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
