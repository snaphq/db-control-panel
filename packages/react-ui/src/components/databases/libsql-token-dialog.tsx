"use client";

import {
  type CreateLibsqlTokenRequest,
  LIBSQL_TOKEN_ACCESS,
  type LibsqlTokenAccess,
} from "@repo/control-plane-contract";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { errorMessage } from "./api";

const EXPIRY_OPTIONS: Array<{ seconds: number | null; label: string }> = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 604_800, label: "7 days" },
  { seconds: 2_592_000, label: "30 days" },
  { seconds: null, label: "Never expires" },
];

const ACCESS_LABEL: Record<LibsqlTokenAccess, string> = {
  read_write: "Read and write",
  read_only: "Read only",
};

interface LibsqlTokenDialogProps {
  trigger: ReactNode;
  databaseName: string;
  onIssue: (body: CreateLibsqlTokenRequest) => Promise<void>;
}

export function LibsqlTokenDialog({
  trigger,
  databaseName,
  onIssue,
}: LibsqlTokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<LibsqlTokenAccess>("read_write");
  const [expiry, setExpiry] = useState<number | null>(2_592_000);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await onIssue({
        access,
        expires_in_seconds: expiry ?? undefined,
      });
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a token for {databaseName}</DialogTitle>
          <DialogDescription>
            Tokens are signed, not stored, so one cannot be revoked on its own:
            it works until it expires. Prefer a short expiry.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Access</Label>
            <Select
              value={access}
              onValueChange={(value) => setAccess(value as LibsqlTokenAccess)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIBSQL_TOKEN_ACCESS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ACCESS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Expires</Label>
            <Select
              value={String(expiry)}
              onValueChange={(value) =>
                setExpiry(value === "null" ? null : Number(value))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.label} value={String(option.seconds)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Issue token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
