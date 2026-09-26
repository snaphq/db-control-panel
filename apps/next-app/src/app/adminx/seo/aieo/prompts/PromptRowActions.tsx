"use client";

import { Button } from "@repo/ui/components/ui/button";
import { useTransition } from "react";
import {
  archivePromptAction,
  snapshotPromptNowAction,
  togglePromptActiveAction,
} from "./actions";

export function PromptRowActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await snapshotPromptNowAction(id);
          })
        }
      >
        Snapshot
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await togglePromptActiveAction(id, !isActive);
          })
        }
      >
        {isActive ? "Pause" : "Activate"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (confirm("Archive this prompt?")) await archivePromptAction(id);
          })
        }
      >
        Archive
      </Button>
    </div>
  );
}
