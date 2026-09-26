"use client";

import { reinferCompetitorsAction } from "@/app/(admin)/seo/aieo/competitors/actions";
import { Button } from "@repo/react-ui/components/ui/button";
import { useState, useTransition } from "react";

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
