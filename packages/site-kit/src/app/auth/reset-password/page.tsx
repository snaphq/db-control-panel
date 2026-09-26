"use client";

import { forgotPassword } from "@repo/auth/client";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import PageWrapper from "@site/components/Container/PageWrapper";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!token) {
      toast.error("Invalid or missing reset token");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await forgotPassword.reset({
        token,
        newPassword: password,
      });

      if (error) {
        toast.error(error.message || "Failed to reset password");
        return;
      }

      toast.success(
        "Password reset successfully! Please sign in with your new password.",
      );
      router.push("/auth/sign-in");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reset password",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <PageWrapper>
        <div className="flex w-full justify-center my-20">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle>Invalid reset link</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Please request a new password reset link.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/auth/forgot-password" className="w-full">
                  <Button className="w-full">Request new link</Button>
                </Link>
                <Link href="/auth/sign-in" className="w-full">
                  <Button variant="ghost" className="w-full">
                    Back to sign in
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex w-full justify-center my-20">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Enter your new password below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Must be at least 8 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Resetting..." : "Reset password"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <Link href="/auth/sign-in" className="underline">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <PageWrapper>
          <div className="flex w-full justify-center my-20">
            <Card className="w-[400px]">
              <CardHeader>
                <CardTitle>Loading...</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </PageWrapper>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
