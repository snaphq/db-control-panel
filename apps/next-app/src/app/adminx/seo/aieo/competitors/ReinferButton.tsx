"use client";

import { Button } from "@repo/ui/components/ui/button";
import { useState, useTransition } from "react";
import { reinferCompetitorsAction } from "./actions";

export function ReinferButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await reinferCompetitorsAction();
          setDone(true);
          setTimeout(() => setDone(false), 3000);
        })
      }
    >
      {pending ? "Queuing…" : done ? "Queued ✓" : "Re-infer"}
    </Button>
  );
}
