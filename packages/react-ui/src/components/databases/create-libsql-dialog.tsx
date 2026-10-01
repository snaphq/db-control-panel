"use client";

import { libsqlDatabaseNameSchema } from "@repo/control-plane-contract";
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
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { errorMessage } from "./api";

interface CreateLibsqlDialogProps {
  trigger: ReactNode;
  onCreate: (name: string) => Promise<void>;
}

export function CreateLibsqlDialog({
  trigger,
  onCreate,
}: CreateLibsqlDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = libsqlDatabaseNameSchema.safeParse(name);
  const hint =
    name !== "" && !parsed.success ? parsed.error.issues[0]?.message : null;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await onCreate(name);
      setOpen(false);
      setName("");
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
          <DialogTitle>Create a libSQL database</DialogTitle>
          <DialogDescription>
            A SQLite-compatible database served at{" "}
            <code>libsql://&lt;name&gt;.lite.alloydb.net</code>. Access it with
            a token you issue afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="libsql-name">Name</Label>
          <Input
            id="libsql-name"
            value={name}
            onChange={(event) => setName(event.target.value.toLowerCase())}
            placeholder="notes"
            maxLength={42}
            autoComplete="off"
          />
          {hint && <p className="text-xs text-destructive">{hint}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !parsed.success}>
            {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Create database
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
