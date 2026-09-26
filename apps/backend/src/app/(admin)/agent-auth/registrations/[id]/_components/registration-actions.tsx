"use client";

import { Button } from "@repo/react-ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type RegistrationAction = "revoke" | "expire";

interface Props {
  id: string;
}

export function RegistrationActions({ id }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<RegistrationAction | null>(null);

  async function run(action: RegistrationAction) {
    setPending(action);
    try {
      const res = await fetch(`/api/admin/agent-auth/registrations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Action failed");
      toast.success(
        action === "revoke"
          ? "Registration revoked"
          : "Registration marked expired",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={pending !== null}
        onClick={() => run("expire")}
      >
        {pending === "expire" ? "Marking expired…" : "Mark expired"}
      </Button>
      <Button
        variant="destructive"
        disabled={pending !== null}
        onClick={() => run("revoke")}
      >
        {pending === "revoke" ? "Revoking…" : "Revoke registration"}
      </Button>
    </div>
  );
}
