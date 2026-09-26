"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimForm({
  claimAttemptToken,
  signedInEmail,
}: {
  claimAttemptToken: string;
  signedInEmail: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/agent/identity/claim/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_attempt_token: claimAttemptToken,
          user_code: code.trim(),
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
      } | null;
      if (res.ok && payload?.success) {
        setDone(true);
        router.refresh();
      } else {
        setError(payload?.message ?? payload?.error ?? "Something went wrong.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-green-600">
          Agent claimed successfully.
        </p>
        <p className="text-muted-foreground">
          Your agent can now use its full scopes on your behalf. You can revoke
          it anytime from the dashboard.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="user_code">6-digit code</Label>
        <Input
          id="user_code"
          name="user_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
          required
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={pending || code.length !== 6}>
        {pending ? "Confirming…" : "Authorize agent"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Signed in as {signedInEmail}. Only the account the agent named can
        complete this claim.
      </p>
    </form>
  );
}
