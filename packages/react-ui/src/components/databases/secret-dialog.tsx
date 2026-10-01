"use client";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CopyField } from "./copy-field";

/** Values the user can see exactly once: passwords, connection URIs, tokens. */
export interface RevealedSecret {
  title: string;
  description: string;
  fields: Array<{ label: string; value: string }>;
}

interface SecretDialogProps {
  secret: RevealedSecret | null;
  onClose: () => void;
}

/**
 * Shows secrets from a create or reset response. The caller drops them from
 * state on close; the console never stores them and the API cannot return
 * them again.
 */
export function SecretDialog({ secret, onClose }: SecretDialogProps) {
  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{secret?.title}</DialogTitle>
          <DialogDescription>{secret?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {secret?.fields.map((field) => (
            <CopyField
              key={field.label}
              label={field.label}
              value={field.value}
            />
          ))}
        </div>
        <p className="text-sm font-medium text-destructive">
          Copy it now. It is shown only once and cannot be retrieved later.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>I have copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
