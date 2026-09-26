"use client";

import { organizationMethods } from "@repo/auth/client";
import { Bell, Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface PendingInvitation {
  id: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
}

export function InvitationBell() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchInvitations = useCallback(async () => {
    try {
      const result = await organizationMethods.listUserInvitations();

      if (result.data && Array.isArray(result.data)) {
        setInvitations(
          (
            result.data as Array<{
              id: string;
              organizationName?: string;
              organizationSlug?: string;
              role?: string;
              status?: string;
            }>
          )
            .filter((inv) => inv.status === "pending")
            .map((inv) => ({
              id: inv.id,
              organizationName: inv.organizationName || "Unknown workspace",
              organizationSlug: inv.organizationSlug || "",
              role: inv.role || "member",
            })),
        );
      }
    } catch {
      // Silently fail - this is a non-critical notification feature
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
    // Refresh every 60 seconds
    const interval = setInterval(fetchInvitations, 60000);
    return () => clearInterval(interval);
  }, [fetchInvitations]);

  const handleAccept = (invitationId: string, orgName: string) => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.acceptInvitation({
          invitationId,
        });

        if (result.error) {
          toast.error(result.error.message || "Failed to accept invitation");
          return;
        }

        toast.success(`Joined ${orgName}`);
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
        router.refresh();
      } catch {
        toast.error("Failed to accept invitation");
      }
    });
  };

  const handleReject = (invitationId: string) => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.rejectInvitation({
          invitationId,
        });

        if (result.error) {
          toast.error(result.error.message || "Failed to decline invitation");
          return;
        }

        toast.success("Invitation declined");
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      } catch {
        toast.error("Failed to decline invitation");
      }
    });
  };

  // Don't render if no invitations and not loading
  if (!loading && invitations.length === 0) {
    return null;
  }

  // Don't render while loading
  if (loading) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {invitations.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
              {invitations.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        <DropdownMenuLabel>Pending Invitations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {invitations.map((inv) => (
          <DropdownMenuItem
            key={inv.id}
            className="flex flex-col items-start gap-2 p-3"
            onSelect={(e) => e.preventDefault()}
          >
            <div className="flex w-full items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {inv.organizationName}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  Role: {inv.role}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleReject(inv.id)}
                  disabled={isPending}
                  title="Decline"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-emerald-600 hover:text-emerald-600"
                  onClick={() => handleAccept(inv.id, inv.organizationName)}
                  disabled={isPending}
                  title="Accept"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
