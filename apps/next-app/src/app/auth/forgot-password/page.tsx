"use client";

import PageWrapper from "@/components/Container/PageWrapper";
import { forgotPassword } from "@repo/auth/client";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await forgotPassword.request({ email });

      if (error) {
        // Still show success to prevent email enumeration
        console.error("Password reset error:", error);
      }

      setIsSubmitted(true);
      toast.success(
        "If an account exists with this email, a reset link has been sent.",
      );
    } catch (error) {
      // Still show success to prevent email enumeration
      console.error("Password reset error:", error);
      setIsSubmitted(true);
      toast.success(
        "If an account exists with this email, a reset link has been sent.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <PageWrapper>
        <div className="flex w-full justify-center my-20">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                If an account exists with the email you provided, we have sent a
                password reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                The link will expire in 1 hour. If you do not see the email,
                check your spam folder.
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                <strong>Development mode:</strong> If no email provider is
                configured, check your server console for the reset link.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail("");
                  }}
                  className="w-full"
                >
                  Try another email
                </Button>
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
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>
              Enter your email address and we will send you a link to reset your
              password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              Remember your password?{" "}
              <Link href="/auth/sign-in" className="underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
