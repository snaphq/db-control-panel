"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { errorMessage } from "./api";

export interface DeleteTarget {
  /** What the user must type to confirm; omit for a plain confirmation. */
  name?: string;
  /** Label of the confirm button; defaults to "Delete". */
  actionLabel?: string;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}

interface ConfirmDeleteDialogProps {
  target: DeleteTarget | null;
  onClose: () => void;
}

/** Destructive confirmation: with a `name`, the button stays off until it is typed. */
export function ConfirmDeleteDialog({
  target,
  onClose,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setTyped("");
    setError(null);
    onClose();
  }

  async function confirm() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      await target.onConfirm();
      close();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.title}</DialogTitle>
          <DialogDescription>{target?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {target?.name !== undefined && (
            <>
              <Label htmlFor="confirm-delete-name">
                Type{" "}
                <span className="font-mono font-semibold">{target.name}</span>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-delete-name"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={
              pending || (target?.name !== undefined && typed !== target.name)
            }
          >
            {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {target?.actionLabel ?? "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
