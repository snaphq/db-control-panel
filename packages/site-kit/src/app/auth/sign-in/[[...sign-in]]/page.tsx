"use client";
import { passkey, signIn, twoFactor } from "@repo/auth/client";
import { Icons } from "@repo/ui/components/Icons";
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
import PageWrapper from "@site/components/Container/PageWrapper";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Stage = "credentials" | "totp" | "backup";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("credentials");
  const [code, setCode] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo =
    searchParams.get("redirect") ||
    searchParams.get("callbackURL") ||
    "/dashboard";

  useEffect(() => {
    if (searchParams.get("error") === "account_archived") {
      setAccountError(
        "This account has been suspended. Reach out to support if you think this is an error.",
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("PublicKeyCredential" in window) ||
      typeof PublicKeyCredential.isConditionalMediationAvailable !== "function"
    ) {
      return;
    }
    let cancelled = false;
    PublicKeyCredential.isConditionalMediationAvailable()
      .then(async (available) => {
        if (!available || cancelled) return;
        const result = await passkey.signIn({ autoFill: true });
        if (cancelled) return;
        if (result && !result.error) {
          router.push(redirectTo);
          router.refresh();
        }
      })
      .catch(() => {
        // Conditional mediation not supported or aborted; ignore.
      });
    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: redirectTo,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to sign in with Google. Please try again.";
      toast.error(message);
      setIsGoogleLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setIsPasskeyLoading(true);
    setAccountError(null);
    try {
      const result = await passkey.signIn();
      if (result?.error) {
        if (
          (result.error as { code?: string }).code === "ACCOUNT_ARCHIVED" ||
          /account has been suspended/i.test(result.error.message ?? "")
        ) {
          setAccountError(
            "This account has been suspended. Reach out to support if you think this is an error.",
          );
          return;
        }
        toast.error(result.error.message ?? "Passkey sign-in failed.");
        return;
      }
      toast.success("Signed in successfully!");
      router.push(redirectTo);
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Passkey sign-in failed.";
      toast.error(message);
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAccountError(null);

    try {
      const { data, error, twoFactorRedirect } = await signIn.email({
        email,
        password,
      });

      if (error) {
        if (
          (error as { code?: string }).code === "ACCOUNT_ARCHIVED" ||
          /account has been suspended/i.test(error.message ?? "")
        ) {
          setAccountError(
            "This account has been suspended. Reach out to support if you think this is an error.",
          );
          return;
        }
        toast.error(
          error.message || "Failed to sign in. Please check your credentials.",
        );
        return;
      }

      if (twoFactorRedirect) {
        setStage("totp");
        return;
      }

      if (data) {
        toast.success("Signed in successfully!");
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to sign in. Please check your credentials.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result =
        stage === "backup"
          ? await twoFactor.verifyBackupCode({ code })
          : await twoFactor.verifyTotp({ code });
      if (result.error) {
        toast.error(result.error.message ?? "Invalid code.");
        return;
      }
      toast.success("Signed in successfully!");
      router.push(redirectTo);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="flex w-full justify-center my-20">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>
              {stage === "credentials"
                ? "Sign In"
                : stage === "backup"
                  ? "Use a backup code"
                  : "Two-factor verification"}
            </CardTitle>
            <CardDescription>
              {stage === "credentials"
                ? "Enter your email and password to sign in to your account"
                : stage === "backup"
                  ? "Enter one of your saved backup codes."
                  : "Enter the 6-digit code from your authenticator app."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accountError && stage === "credentials" && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {accountError}
              </div>
            )}
            {stage === "credentials" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username webauthn"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-sm underline text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password webauthn"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tfa-code">
                    {stage === "backup" ? "Backup code" : "Verification code"}
                  </Label>
                  <Input
                    id="tfa-code"
                    inputMode={stage === "backup" ? "text" : "numeric"}
                    pattern={stage === "backup" ? undefined : "[0-9]*"}
                    maxLength={stage === "backup" ? undefined : 6}
                    value={code}
                    onChange={(e) =>
                      setCode(
                        stage === "backup"
                          ? e.target.value
                          : e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    required
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || code.length === 0}
                >
                  {isLoading ? "Verifying..." : "Verify"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground underline"
                  onClick={() => {
                    setCode("");
                    setStage(stage === "backup" ? "totp" : "backup");
                  }}
                >
                  {stage === "backup"
                    ? "Use authenticator code instead"
                    : "Use a backup code instead"}
                </button>
              </form>
            )}

            {stage === "credentials" ? (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handlePasskeySignIn}
                    disabled={isPasskeyLoading}
                  >
                    {isPasskeyLoading ? (
                      <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" />
                    )}
                    Sign in with passkey
                  </Button>
                  {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleSignIn}
                      disabled={isGoogleLoading}
                    >
                      {isGoogleLoading ? (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Icons.google className="mr-2 h-4 w-4" />
                      )}
                      Google
                    </Button>
                  )}
                </div>
              </>
            ) : null}

            {stage === "credentials" ? (
              <div className="mt-4 text-center text-sm">
                Don&apos;t have an account?{" "}
                <Link href="/auth/sign-up" className="underline">
                  Sign up
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
