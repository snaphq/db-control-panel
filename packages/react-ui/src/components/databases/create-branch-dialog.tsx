"use client";

import {
  type CreateBranchRequest,
  lsnSchema,
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
import { checkPointInTime, toLocalInputValue } from "./point-in-time";

interface CreateBranchDialogProps {
  trigger: ReactNode;
  branches: Array<{ id: string; name: string; isDefault: boolean }>;
  /** How far back a branch can start; the project's `history_retention_seconds`. */
  historyRetentionSeconds: number;
  onCreate: (body: CreateBranchRequest) => Promise<void>;
}

type Start = "now" | "time" | "lsn";

export function CreateBranchDialog({
  trigger,
  branches,
  historyRetentionSeconds,
  onCreate,
}: CreateBranchDialogProps) {
  const defaultParent = branches.find((b) => b.isDefault) ?? branches[0];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(defaultParent?.id ?? "");
  const [start, setStart] = useState<Start>("now");
  const [lsn, setLsn] = useState("");
  const [moment, setMoment] = useState("");
  const [withCompute, setWithCompute] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lsnValid = start !== "lsn" || lsnSchema.safeParse(lsn.trim()).success;
  const timeCheck = checkPointInTime(moment, historyRetentionSeconds);
  const timeValid = start !== "time" || timeCheck.ok;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        parent_id: parentId || undefined,
        parent_lsn: start === "lsn" ? lsn.trim() : undefined,
        parent_timestamp:
          start === "time" && timeCheck.ok ? timeCheck.utc : undefined,
        endpoint: withCompute ? {} : undefined,
      });
      setOpen(false);
      setName("");
      setLsn("");
      setMoment("");
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
          <DialogTitle>Create a branch</DialogTitle>
          <DialogDescription>
            A copy-on-write fork of another branch. It shares storage with its
            parent until either side changes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="branch-name">Name</Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="feature-login"
              maxLength={64}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Parent branch</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Start from</Label>
            <Select
              value={start}
              onValueChange={(value) => setStart(value as Start)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Now (latest data)</SelectItem>
                <SelectItem value="time">From a point in time</SelectItem>
                <SelectItem value="lsn">A past point (LSN)</SelectItem>
              </SelectContent>
            </Select>
            {start === "time" && (
              <>
                <Input
                  type="datetime-local"
                  value={moment}
                  onChange={(event) => setMoment(event.target.value)}
                  min={toLocalInputValue(
                    new Date(Date.now() - historyRetentionSeconds * 1000),
                  )}
                  max={toLocalInputValue(new Date())}
                  aria-label="Point in time"
                  aria-invalid={moment !== "" && !timeCheck.ok}
                />
                <p className="text-xs text-muted-foreground">
                  {timeCheck.ok
                    ? `Your local time, sent as ${timeCheck.utc} (UTC). The branch holds the data as of that moment.`
                    : (timeCheck.reason ??
                      "Your local time; it is converted to UTC. Pick a moment inside the project's history window.")}
                </p>
              </>
            )}
            {start === "lsn" && (
              <>
                <Input
                  value={lsn}
                  onChange={(event) => setLsn(event.target.value)}
                  placeholder="0/16B5A50"
                  className="font-mono"
                  aria-invalid={!lsnValid}
                />
                <p className="text-xs text-muted-foreground">
                  A Postgres log sequence number inside the project's history
                  window, in <code>hi/lo</code> hexadecimal form.
                </p>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withCompute}
              onChange={(event) => setWithCompute(event.target.checked)}
            />
            Create a compute endpoint for this branch
          </label>
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
          <Button
            onClick={submit}
            disabled={pending || name.trim() === "" || !lsnValid || !timeValid}
          >
            {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Create branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
