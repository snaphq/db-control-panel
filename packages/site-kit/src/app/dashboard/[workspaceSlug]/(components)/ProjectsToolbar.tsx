"use client";

import { organizationMethods } from "@repo/auth/client";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/react-ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/react-ui/components/ui/dropdown-menu";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/react-ui/components/ui/select";
import { cn } from "@repo/react-ui/lib/utils";
import {
  ChevronDown,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  Search,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export type ViewMode = "grid" | "list";

interface ProjectsToolbarProps {
  workspaceSlug: string;
  organizationId: string;
  canManageMembers: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ProjectsToolbar({
  workspaceSlug,
  organizationId,
  canManageMembers,
  search,
  onSearchChange,
  view,
  onViewChange,
}: ProjectsToolbarProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [isInviting, setIsInviting] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    setIsInviting(true);
    try {
      const result = await organizationMethods.createInvitation({
        email: inviteEmail.trim(),
        role: inviteRole,
        organizationId,
      });
      if (result.error) {
        toast.error(result.error.message || "Failed to send invitation");
        return;
      }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const inviteAction = (
    <DropdownMenuItem
      disabled={!canManageMembers}
      onSelect={(e) => {
        e.preventDefault();
        if (canManageMembers) setInviteOpen(true);
      }}
    >
      <UserPlus className="mr-2 h-4 w-4" />
      Team Member
    </DropdownMenuItem>
  );

  return (
    <>
      <div className="flex w-full items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search projects…"
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Filter"
          title="Filter (coming soon)"
          disabled
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <div
          aria-label="View mode"
          className="inline-flex items-center rounded-md border bg-background p-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", view === "grid" && "bg-accent")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => onViewChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", view === "list" && "bg-accent")}
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => onViewChange("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              Add New
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                href={`/dashboard/${encodeURIComponent(workspaceSlug)}/~/projects/new`}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                Project
              </Link>
            </DropdownMenuItem>
            {canManageMembers ? (
              inviteAction
            ) : (
              <span title="Requires admin or owner role">{inviteAction}</span>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInvite();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as "member" | "admin")}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isInviting}>
              {isInviting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
