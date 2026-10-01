"use client";

import {
  COMPUTE_SIZES,
  type ComputeSize,
  type CreateProjectRequest,
  DEFAULT_SUSPEND_TIMEOUT_SECONDS,
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
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { errorMessage } from "./api";

/** Suspend-after choices in seconds; `0` keeps the compute running. */
const SUSPEND_OPTIONS: Array<{ seconds: number; label: string }> = [
  { seconds: 60, label: "After 1 minute" },
  { seconds: DEFAULT_SUSPEND_TIMEOUT_SECONDS, label: "After 5 minutes" },
  { seconds: 900, label: "After 15 minutes" },
  { seconds: 3600, label: "After 1 hour" },
  { seconds: 0, label: "Never suspend" },
];

interface CreateNeonDialogProps {
  trigger: ReactNode;
  onCreate: (body: CreateProjectRequest) => Promise<void>;
}

export function CreateNeonDialog({ trigger, onCreate }: CreateNeonDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState<ComputeSize>("1");
  const [suspend, setSuspend] = useState(DEFAULT_SUSPEND_TIMEOUT_SECONDS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        pg_version: 17,
        compute_size: size,
        suspend_timeout_seconds: suspend,
      });
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
          <DialogTitle>Create a Postgres database</DialogTitle>
          <DialogDescription>
            A serverless Postgres project with a <code>main</code> branch, a
            compute endpoint, an owner role and a <code>neondb</code> database.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="neon-name">Name</Label>
            <Input
              id="neon-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-app"
              maxLength={64}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Postgres version</Label>
            <Input value="Postgres 17" disabled readOnly />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Compute size</Label>
              <Select
                value={size}
                onValueChange={(value) => setSize(value as ComputeSize)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPUTE_SIZES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option} CU ({Number(option)} vCPU, {Number(option) * 4}{" "}
                      GiB)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Suspend compute</Label>
              <Select
                value={String(suspend)}
                onValueChange={(value) => setSuspend(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUSPEND_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.seconds}
                      value={String(option.seconds)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
          <Button onClick={submit} disabled={pending || name.trim() === ""}>
            {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Create database
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
