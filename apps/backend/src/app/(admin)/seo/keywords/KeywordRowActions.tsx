"use client";

import {
  archiveKeywordAction,
  snapshotKeywordNowAction,
  toggleKeywordActiveAction,
} from "@/app/(admin)/seo/keywords/actions";
import { Button } from "@repo/react-ui/components/ui/button";
import { useState, useTransition } from "react";

export function KeywordRowActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function snapshot() {
    setFeedback(null);
    startTransition(async () => {
      const res = await snapshotKeywordNowAction(id);
      setFeedback(res.message ?? (res.ok ? "Queued" : "Failed"));
    });
  }

  function toggle() {
    setFeedback(null);
    startTransition(async () => {
      await toggleKeywordActiveAction(id, !isActive);
    });
  }

  function archive() {
    if (!confirm("Archive this keyword? Historical snapshots remain attached."))
      return;
    setFeedback(null);
    startTransition(async () => {
      await archiveKeywordAction(id);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={snapshot}
        disabled={pending}
        title="Trigger an ad-hoc DataForSEO snapshot via Inngest"
      >
        Snapshot
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        disabled={pending}
        title={isActive ? "Pause weekly tracking" : "Resume weekly tracking"}
      >
        {isActive ? "Pause" : "Resume"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={archive}
        disabled={pending || !isActive}
      >
        Archive
      </Button>
      {feedback ? (
        <span className="text-[11px] text-muted-foreground ml-1">
          {feedback}
        </span>
      ) : null}
    </div>
  );
}
