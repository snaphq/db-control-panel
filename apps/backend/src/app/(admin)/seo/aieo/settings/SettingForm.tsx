"use client";

import { setSettingAction } from "@/app/(admin)/seo/aieo/settings/actions";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useState, useTransition } from "react";

interface Props {
  settingKey: string;
  type: "string" | "number" | "array";
  initialValue: string;
}

export function SettingForm({ settingKey, type, initialValue }: Props) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initialValue);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="flex items-end gap-3 flex-wrap"
      action={(fd) => {
        setMsg(null);
        setErr(null);
        fd.set("key", settingKey);
        fd.set("value", value);
        fd.set("type", type);
        startTransition(async () => {
          const r = await setSettingAction(fd);
          if (!r.ok) setErr(r.message ?? "Failed");
          else setMsg("Saved");
        });
      }}
    >
      <div className="flex-1 min-w-64">
        {type === "array" ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
        ) : (
          <Input
            type={type === "number" ? "number" : "text"}
            step={type === "number" ? "0.01" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {msg ? <p className="text-sm text-emerald-600 w-full">{msg}</p> : null}
      {err ? <p className="text-sm text-rose-600 w-full">{err}</p> : null}
    </form>
  );
}
