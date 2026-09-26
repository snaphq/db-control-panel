"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useState, useTransition } from "react";
import { createPromptAction } from "./actions";

export function AddPromptForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={(fd: FormData) => {
        setError(null);
        startTransition(async () => {
          const r = await createPromptAction(fd);
          if (!r.ok) setError(r.message ?? "Failed");
          else
            (
              document.getElementById("prompt-form") as HTMLFormElement | null
            )?.reset();
        });
      }}
      id="prompt-form"
    >
      <div className="sm:col-span-2 space-y-1.5">
        <Label htmlFor="prompt">Prompt</Label>
        <Input
          id="prompt"
          name="prompt"
          placeholder="What is the best app review tool?"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cluster">Cluster</Label>
        <Input id="cluster" name="cluster" placeholder="reviews-tracking" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="intent">Intent</Label>
        <Input id="intent" name="intent" placeholder="commercial" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="priority">Priority</Label>
        <Input
          id="priority"
          name="priority"
          placeholder="medium"
          defaultValue="medium"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="targetPath">Target path</Label>
        <Input
          id="targetPath"
          name="targetPath"
          placeholder="/blog/best-app-review-tools"
        />
      </div>
      <div className="sm:col-span-2 flex justify-between items-center">
        {error ? <p className="text-sm text-rose-600">{error}</p> : <span />}
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add prompt"}
        </Button>
      </div>
    </form>
  );
}
