"use client";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/react-ui/components/ui/dropdown-menu";
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Action {
  label: string;
  description: string;
  url: string;
  method: "POST" | "DELETE";
  variant: "default" | "destructive";
  icon: "archive" | "unarchive" | "delete";
}

interface Props {
  archived: boolean;
  archiveUrl: string;
  unarchiveUrl: string;
  deleteUrl: string;
  onDone?: () => void;
}

const ICONS = {
  archive: Archive,
  unarchive: ArchiveRestore,
  delete: Trash2,
};

export function RowActionsMenu({
  archived,
  archiveUrl,
  unarchiveUrl,
  deleteUrl,
  onDone,
}: Props) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [running, setRunning] = useState(false);

  const actions: Action[] = archived
    ? [
        {
          label: "Unarchive",
          description: "Restore access. The account will be usable again.",
          url: unarchiveUrl,
          method: "POST",
          variant: "default",
          icon: "unarchive",
        },
        {
          label: "Delete",
          description:
            "Permanently delete. This cannot be undone and may fail if the record is still in use.",
          url: deleteUrl,
          method: "DELETE",
          variant: "destructive",
          icon: "delete",
        },
      ]
    : [
        {
          label: "Archive",
          description:
            "Archive so the account can no longer sign in or be accessed. Reversible.",
          url: archiveUrl,
          method: "POST",
          variant: "default",
          icon: "archive",
        },
        {
          label: "Delete",
          description:
            "Permanently delete. This cannot be undone and may fail if the record is still in use.",
          url: deleteUrl,
          method: "DELETE",
          variant: "destructive",
          icon: "delete",
        },
      ];

  async function confirm() {
    if (!pendingAction) return;
    setRunning(true);
    try {
      const res = await fetch(pendingAction.url, {
        method: pendingAction.method,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error ?? `${pendingAction.label} failed`);
        return;
      }
      toast.success(`${pendingAction.label} successful`);
      setPendingAction(null);
      onDone?.();
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Row actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a, idx) => {
            const Icon = ICONS[a.icon];
            return (
              <div key={a.label}>
                {idx > 0 && a.variant === "destructive" && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setPendingAction(a);
                  }}
                  className={
                    a.variant === "destructive"
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {a.label}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(v) => !v && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={running}
              className={
                pendingAction?.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {running ? "Working…" : pendingAction?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
