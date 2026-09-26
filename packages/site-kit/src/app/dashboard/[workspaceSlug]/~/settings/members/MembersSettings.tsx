"use client";

import { organizationMethods } from "@repo/auth/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/ui/avatar";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Copy,
  Loader2,
  LogOut,
  Mail,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type InvitationData,
  type MemberData,
  getInitials,
  getRoleBadge,
} from "./members-utils";

interface MembersSettingsProps {
  organizationId: string;
  organizationSlug: string;
  currentUserId: string;
  currentUserRole: string;
  canManageMembers: boolean;
  initialMembers: MemberData[];
  initialInvitations: InvitationData[];
}

export function MembersSettings({
  organizationId,
  organizationSlug,
  currentUserId,
  currentUserRole,
  canManageMembers,
  initialMembers,
  initialInvitations,
}: MembersSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [members] = useState<MemberData[]>(initialMembers);
  const [invitations, setInvitations] =
    useState<InvitationData[]>(initialInvitations);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "leave";
    memberId: string;
    memberName: string;
  } | null>(null);

  const isOwner = currentUserRole === "owner";

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
      setInviteEmail("");
      setInviteRole("member");
      if (result.data) {
        setInvitations((prev) => [
          ...prev,
          {
            id: (result.data as { id: string }).id,
            email: inviteEmail.trim(),
            role: inviteRole,
            status: "pending",
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.cancelInvitation({
          invitationId,
        });
        if (result.error) {
          toast.error(result.error.message || "Failed to cancel invitation");
          return;
        }
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
        toast.success("Invitation cancelled");
      } catch {
        toast.error("Failed to cancel invitation");
      }
    });
  };

  const handleCopyInviteLink = async (invitationId: string) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${baseUrl}/auth/invitation/${invitationId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast.success("Invite link copied to clipboard");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.removeMember({
          memberIdOrEmail: memberId,
          organizationId,
        });
        if (result.error) {
          toast.error(result.error.message || "Failed to remove member");
          return;
        }
        toast.success("Member removed");
        setConfirmAction(null);
        router.refresh();
      } catch {
        toast.error("Failed to remove member");
      }
    });
  };

  const handleLeaveOrganization = async () => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.leaveOrganization({
          organizationId,
        });
        if (result.error) {
          toast.error(result.error.message || "Failed to leave organization");
          return;
        }
        toast.success("You have left the workspace");
        setConfirmAction(null);
        router.push("/dashboard");
      } catch {
        toast.error("Failed to leave organization");
      }
    });
  };

  const handleUpdateRole = async (
    memberId: string,
    newRole: "member" | "admin" | "owner",
  ) => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.updateMemberRole({
          memberId,
          role: newRole,
          organizationId,
        });
        if (result.error) {
          toast.error(result.error.message || "Failed to update role");
          return;
        }
        toast.success("Role updated");
        router.refresh();
      } catch {
        toast.error("Failed to update role");
      }
    });
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Invite Member Section */}
      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite Member
            </CardTitle>
            <CardDescription>
              Invite new members to join this workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="invite-email" className="sr-only">
                  Email address
                </Label>
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
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as "member" | "admin")}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={isInviting}>
                {isInviting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Invite
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Invitations */}
      {canManageMembers && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
              <Badge variant="secondary" className="ml-1">
                {invitations.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Invitations waiting to be accepted
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-3 px-4 rounded-lg border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {inv.email[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {inv.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sent{" "}
                        {new Date(inv.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getRoleBadge(inv.role)}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopyInviteLink(inv.id)}
                      title="Copy invite link"
                    >
                      {copiedLink ? (
                        <span className="text-emerald-500 text-xs">ok</span>
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleCancelInvitation(inv.id)}
                      disabled={isPending}
                      title="Cancel invitation"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
            <Badge variant="secondary" className="ml-1">
              {members.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            People who have access to this workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((m) => {
              const isCurrentUser = m.userId === currentUserId;
              const isMemberOwner = m.role === "owner";
              const canChangeRole = isOwner && !isCurrentUser;
              const canRemove =
                canManageMembers && !isCurrentUser && !isMemberOwner;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-3 px-4 rounded-lg border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9">
                      {m.userImage && <AvatarImage src={m.userImage} />}
                      <AvatarFallback className="text-xs">
                        {getInitials(m.userName || m.userEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {m.userName || m.userEmail}
                        </p>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.userEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canChangeRole ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          handleUpdateRole(
                            m.id,
                            v as "member" | "admin" | "owner",
                          )
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      getRoleBadge(m.role)
                    )}
                    {canRemove && (
                      <Dialog
                        open={
                          confirmAction?.type === "remove" &&
                          confirmAction.memberId === m.id
                        }
                        onOpenChange={(open) => {
                          if (!open) setConfirmAction(null);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() =>
                              setConfirmAction({
                                type: "remove",
                                memberId: m.id,
                                memberName: m.userName || m.userEmail,
                              })
                            }
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Remove Member</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to remove{" "}
                              <strong>{m.userName || m.userEmail}</strong> from
                              this workspace? They will lose access immediately.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setConfirmAction(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleRemoveMember(m.id)}
                              disabled={isPending}
                            >
                              {isPending && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              )}
                              Remove
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    {isCurrentUser && !isMemberOwner && (
                      <Dialog
                        open={confirmAction?.type === "leave"}
                        onOpenChange={(open) => {
                          if (!open) setConfirmAction(null);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() =>
                              setConfirmAction({
                                type: "leave",
                                memberId: m.id,
                                memberName: "yourself",
                              })
                            }
                            title="Leave workspace"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Leave Workspace</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to leave this workspace? You
                              will lose access immediately and will need a new
                              invitation to rejoin.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setConfirmAction(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={handleLeaveOrganization}
                              disabled={isPending}
                            >
                              {isPending && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              )}
                              Leave
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
