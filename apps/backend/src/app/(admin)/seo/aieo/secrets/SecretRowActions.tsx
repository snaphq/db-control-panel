"use client";

import { deleteSecretAction } from "@/app/(admin)/seo/aieo/secrets/actions";
import { Button } from "@repo/ui/components/ui/button";
import { useTransition } from "react";

export function SecretRowActions({ secretKey }: { secretKey: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (confirm(`Delete ${secretKey}? This cannot be undone.`)) {
            await deleteSecretAction(secretKey);
          }
        })
      }
    >
      Delete
    </Button>
  );
}
