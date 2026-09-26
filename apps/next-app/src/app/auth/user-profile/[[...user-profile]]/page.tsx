"use client";
import PageWrapper from "@/components/Container/PageWrapper";
import { useSession } from "@repo/auth/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const UserProfilePage = () => {
  const { data: session, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session?.user) {
      router.push("/auth/sign-in");
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex justify-center items-center p-9 h-full">
          <div>Loading...</div>
        </div>
      </PageWrapper>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <PageWrapper>
      <div className="flex justify-center items-center p-9 h-full">
        <Card className="w-[600px]">
          <CardHeader>
            <CardTitle>User Profile</CardTitle>
            <CardDescription>
              View and manage your account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <Avatar className="w-20 h-20">
                <AvatarImage
                  src={session.user.image || ""}
                  alt={session.user.name || undefined}
                />
                <AvatarFallback className="text-2xl">
                  {session.user.name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-2xl">{session.user.name}</h3>
                <p className="text-muted-foreground text-sm">
                  {session.user.email}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <p className="text-sm">{session.user.name}</p>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <p className="text-sm">{session.user.email}</p>
              </div>

              <div className="space-y-2">
                <Label>Email Verified</Label>
                <p className="text-sm">
                  {session.user.emailVerified ? "Yes" : "No"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Account Created</Label>
                <p className="text-sm">
                  {session.user.createdAt
                    ? new Date(session.user.createdAt).toLocaleDateString()
                    : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
};

export default UserProfilePage;
