"use client";

import {
  excludeCompetitorAction,
  pinCompetitorAction,
} from "@/app/(admin)/seo/aieo/competitors/actions";
import { Button } from "@repo/ui/components/ui/button";
import { useTransition } from "react";

export function CompetitorRowActions({
  id,
  isManual,
  isExcluded,
}: {
  id: string;
  isManual: boolean;
  isExcluded: boolean;
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
            await pinCompetitorAction(id, !isManual);
          })
        }
      >
        {isManual ? "Unpin" : "Pin"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await excludeCompetitorAction(id, !isExcluded);
          })
        }
      >
        {isExcluded ? "Include" : "Exclude"}
      </Button>
    </div>
  );
}
