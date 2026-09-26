"use client";

import { organizationMethods, useSession } from "@repo/auth/client";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Check, Loader2, Mail, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

interface InvitationDetails {
  organizationName: string;
  organizationSlug: string;
  email: string;
  inviterEmail: string;
  role: string;
  status: string;
}

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const invitationId = params.id as string;

  const { data: session, isLoading: sessionLoading } = useSession();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const result = await organizationMethods.getInvitation({
          id: invitationId,
        });

        if (result.error) {
          setError(result.error.message || "Invitation not found");
          return;
        }

        if (result.data) {
          const data = result.data as {
            organizationName?: string;
            organizationSlug?: string;
            email?: string;
            inviterEmail?: string;
            role?: string;
            status?: string;
          };
          setInvitation({
            organizationName: data.organizationName || "Unknown",
            organizationSlug: data.organizationSlug || "",
            email: data.email || "",
            inviterEmail: data.inviterEmail || "",
            role: data.role || "member",
            status: data.status || "pending",
          });
        }
      } catch {
        setError("Failed to load invitation details");
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [invitationId]);

  const handleAccept = () => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.acceptInvitation({
          invitationId,
        });

        if (result.error) {
          toast.error(result.error.message || "Failed to accept invitation");
          return;
        }

        setHandled(true);
        toast.success(
          `You have joined ${invitation?.organizationName || "the workspace"}`,
        );

        // Redirect to the workspace dashboard
        if (invitation?.organizationSlug) {
          router.push(`/dashboard/${invitation.organizationSlug}/~/settings`);
        } else {
          router.push("/dashboard");
        }
      } catch {
        toast.error("Failed to accept invitation");
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      try {
        const result = await organizationMethods.rejectInvitation({
          invitationId,
        });

        if (result.error) {
          toast.error(result.error.message || "Failed to decline invitation");
          return;
        }

        setHandled(true);
        toast.success("Invitation declined");
        router.push("/dashboard");
      } catch {
        toast.error("Failed to decline invitation");
      }
    });
  };

  // Show loading state
  if (loading || sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not logged in — redirect to sign-in with return URL
  if (!session?.user) {
    const returnUrl = `/auth/invitation/${invitationId}`;
    router.push(`/auth/sign-in?redirect=${encodeURIComponent(returnUrl)}`);
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Redirecting to sign in...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Already handled (expired, accepted, etc.)
  if (invitation?.status !== "pending" || handled) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation {invitation?.status || "handled"}</CardTitle>
            <CardDescription>
              This invitation has already been {invitation?.status || "handled"}
              .
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join a workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Workspace</span>
              <span className="text-sm font-medium">
                {invitation.organizationName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <span className="text-sm font-medium capitalize">
                {invitation.role}
              </span>
            </div>
            {invitation.inviterEmail && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Invited by
                </span>
                <span className="text-sm font-medium">
                  {invitation.inviterEmail}
                </span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleReject}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            Decline
          </Button>
          <Button
            className="flex-1"
            onClick={handleAccept}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Accept
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
