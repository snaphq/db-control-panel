"use client";

import { twoFactor } from "@repo/auth/client";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

type Mode =
  | "idle"
  | "enable-password"
  | "enable-verify"
  | "disable-password"
  | "show-backup";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!totpUri) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(totpUri, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [totpUri]);

  const reset = () => {
    setMode("idle");
    setPassword("");
    setCode("");
    setTotpUri(null);
    setQrDataUrl(null);
    setBackupCodes([]);
    setError(null);
    setBusy(false);
  };

  const startEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await twoFactor.enable({ password });
      if (result.error) {
        setError(result.error.message ?? "Failed to enable two-factor.");
        return;
      }
      const data = result.data as
        | { totpURI?: string; backupCodes?: string[] }
        | undefined;
      setTotpUri(data?.totpURI ?? null);
      setBackupCodes(data?.backupCodes ?? []);
      setMode("enable-verify");
    } finally {
      setBusy(false);
    }
  };

  const verifyEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await twoFactor.verifyTotp({ code });
      if (result.error) {
        setError(result.error.message ?? "Invalid code.");
        return;
      }
      setMode("show-backup");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await twoFactor.disable({ password });
      if (result.error) {
        setError(result.error.message ?? "Failed to disable.");
        return;
      }
      reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const dialogOpen = mode !== "idle";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>
          Add a verification step at sign-in using an authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">
                Authenticator app (TOTP)
              </div>
              <div className="text-xs text-muted-foreground">
                {enabled
                  ? "Two-factor authentication is enabled."
                  : "Not enabled."}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "secondary" : "outline"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setMode(enabled ? "disable-password" : "enable-password")
              }
            >
              {enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) reset();
        }}
      >
        <DialogContent>
          {mode === "enable-password" || mode === "disable-password" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {mode === "enable-password"
                    ? "Enable two-factor"
                    : "Disable two-factor"}
                </DialogTitle>
                <DialogDescription>
                  Confirm your password to continue.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="tfa-password">Password</Label>
                <Input
                  id="tfa-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={mode === "enable-password" ? startEnable : disable}
                  disabled={busy || !password}
                >
                  {busy
                    ? "Working..."
                    : mode === "enable-password"
                      ? "Continue"
                      : "Disable"}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {mode === "enable-verify" ? (
            <>
              <DialogHeader>
                <DialogTitle>Scan and verify</DialogTitle>
                <DialogDescription>
                  Scan the QR code with your authenticator app, then enter the
                  6-digit code.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="TOTP QR code"
                    width={220}
                    height={220}
                  />
                ) : (
                  <div className="h-[220px] w-[220px] rounded bg-muted" />
                )}
                {totpUri ? (
                  <details className="w-full text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      Can&apos;t scan? Show secret
                    </summary>
                    <code className="mt-2 block break-all rounded bg-muted p-2 text-[11px]">
                      {totpUri}
                    </code>
                  </details>
                ) : null}
                <div className="w-full space-y-2">
                  <Label htmlFor="tfa-code">Verification code</Label>
                  <Input
                    id="tfa-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                  {error ? (
                    <p className="text-sm text-destructive">{error}</p>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={verifyEnable}
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "Verifying..." : "Verify & enable"}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {mode === "show-backup" ? (
            <>
              <DialogHeader>
                <DialogTitle>Save your backup codes</DialogTitle>
                <DialogDescription>
                  Store these codes somewhere safe. Each can be used once if you
                  lose access to your authenticator.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 rounded border bg-muted/40 p-3 font-mono text-sm">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(backupCodes.join("\n"))
                  }
                >
                  Copy codes
                </Button>
                <Button onClick={reset}>Done</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
