"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/react-ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/react-ui/components/ui/alert-dialog";
import { Button } from "@repo/react-ui/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Busy {
  message: string;
  activeOperationId: string | null;
}

interface Props {
  label: string;
  /** What the operation does, shown in the confirmation. */
  description: string;
  /** The admin route that starts it, for example /api/admin/platform/pageservers/rebalance. */
  url: string;
}

/**
 * Starts a platform operation after a confirmation, then follows it: on 202 it
 * opens the returned operation; on 409 `platform_busy` it says so and links to
 * the operation that holds the lock.
 */
export function PlatformActionButton({ label, description, url }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<Busy | null>(null);

  async function start() {
    setRunning(true);
    setBusy(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 202 && payload?.operation?.id) {
        setOpen(false);
        toast.success(`${label} started`);
        router.push(`/platform/operations/${payload.operation.id}`);
        return;
      }
      setOpen(false);
      if (response.status === 409 && payload?.code === "platform_busy") {
        setBusy({
          message: payload.error,
          activeOperationId: payload.active_operation_id ?? null,
        });
        return;
      }
      toast.error(payload?.error ?? `${label} failed`);
    } catch (error) {
      console.error(error);
      setOpen(false);
      toast.error(`${label} failed: the portal could not be reached`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {label}
        </Button>
      </div>
      {busy ? (
        <Alert role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>A platform operation is already running</AlertTitle>
          <AlertDescription>
            <p>{busy.message}</p>
            {busy.activeOperationId ? (
              <p className="mt-1">
                <Link
                  className="underline"
                  href={`/platform/operations/${busy.activeOperationId}`}
                >
                  Follow the running operation
                </Link>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog
        open={open}
        onOpenChange={(value) => !running && setOpen(value)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={running}
              onClick={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              {running ? "Starting…" : label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
