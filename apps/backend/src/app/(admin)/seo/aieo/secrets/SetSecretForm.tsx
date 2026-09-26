"use client";

import { setSecretAction } from "@/app/(admin)/seo/aieo/secrets/actions";
import { Button } from "@repo/react-ui/components/ui/button";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/react-ui/components/ui/select";
import { useState, useTransition } from "react";

export function SetSecretForm({ allKeys }: { allKeys: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [selectedKey, setSelectedKey] = useState(allKeys[0] ?? "");

  return (
    <form
      className="flex items-end gap-3 flex-wrap"
      action={(fd) => {
        setError(null);
        setDone(false);
        fd.set("key", selectedKey);
        startTransition(async () => {
          const r = await setSecretAction(fd);
          if (!r.ok) setError(r.message ?? "Failed");
          else {
            setDone(true);
            (
              document.getElementById(
                "set-secret-form",
              ) as HTMLFormElement | null
            )?.reset();
          }
        });
      }}
      id="set-secret-form"
    >
      <div className="space-y-1.5 min-w-48">
        <Label htmlFor="key">Key</Label>
        <Select value={selectedKey} onValueChange={setSelectedKey}>
          <SelectTrigger id="key">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allKeys.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 flex-1 min-w-64">
        <Label htmlFor="value">Value (paste secret)</Label>
        <Input
          id="value"
          name="value"
          type="password"
          placeholder="sk-..."
          required
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {error ? <p className="text-sm text-rose-600 w-full">{error}</p> : null}
      {done ? <p className="text-sm text-emerald-600 w-full">Saved.</p> : null}
    </form>
  );
}
