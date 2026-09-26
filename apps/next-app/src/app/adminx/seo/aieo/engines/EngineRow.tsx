"use client";

import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useState, useTransition } from "react";
import { setEngineModelAction, toggleEngineAction } from "./actions";

interface EngineProps {
  engine: {
    id: string;
    label: string;
    vendor: string;
    modelId: string | null;
    isActive: boolean;
  };
}

export function EngineRow({ engine }: EngineProps) {
  const [pending, startTransition] = useTransition();
  const [modelId, setModelId] = useState(engine.modelId ?? "");
  const [active, setActive] = useState(engine.isActive);

  function persistModel() {
    const fd = new FormData();
    fd.set("id", engine.id);
    fd.set("modelId", modelId);
    startTransition(async () => {
      await setEngineModelAction(fd);
    });
  }

  function toggle() {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      await toggleEngineAction(engine.id, next);
    });
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{engine.label}</td>
      <td className="px-4 py-2 text-muted-foreground">{engine.vendor}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder={engine.id === "google_aio" ? "n/a" : "model-id"}
            disabled={engine.id === "google_aio" || pending}
            className="h-8 text-xs font-mono w-48"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || engine.id === "google_aio"}
            onClick={persistModel}
          >
            Save
          </Button>
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          disabled={pending}
          onClick={toggle}
        >
          {active ? (
            <Badge className="bg-transparent text-inherit shadow-none">
              Active
            </Badge>
          ) : (
            "Off"
          )}
        </Button>
      </td>
    </tr>
  );
}
