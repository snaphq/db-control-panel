"use client";

import { validateAllSecretsAction } from "@/app/(admin)/seo/aieo/secrets/actions";
import { Button } from "@repo/ui/components/ui/button";
import { useState, useTransition } from "react";

export function ValidateAllButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await validateAllSecretsAction();
          setDone(true);
          setTimeout(() => setDone(false), 3000);
        })
      }
    >
      {pending ? "Queuing…" : done ? "Queued ✓" : "Validate all"}
    </Button>
  );
}
