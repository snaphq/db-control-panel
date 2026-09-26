"use client";

import type {
  Integration,
  IntegrationInstallation,
} from "@repo/database/schema";
import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { ConfigSchema } from "./install-integration-form";

interface InstallationManagerProps {
  installation: Omit<IntegrationInstallation, "configEncrypted"> & {
    hasSecret?: boolean;
  };
  integration: Integration;
  /** Where to send the user after uninstall */
  postDeleteHref: string;
}

export function InstallationManager({
  installation,
  integration,
  postDeleteHref,
}: InstallationManagerProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(
    installation.displayName ?? integration.name,
  );
  const [savedName, setSavedName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  const configSchema =
    (integration.configSchema as ConfigSchema | null) ?? null;
  const secretFields = useMemo(() => {
    const props = configSchema?.properties ?? {};
    return Object.entries(props).filter(
      ([, prop]) => prop.format === "password",
    );
  }, [configSchema]);
  const hasSecretChanges = Object.values(secretValues).some(
    (v) => v.trim().length > 0,
  );

  const dirty =
    displayName.trim() !== savedName && displayName.trim().length > 0;

  async function handleSaveName() {
    setSavingName(true);
    try {
      const res = await fetch(`/api/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Update failed");
      }
      setSavedName(displayName.trim());
      toast.success("Updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingName(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/installations/${installation.id}/verify`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error ?? "Verification failed");
      }
      toast.success("Verified");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRotateSecrets() {
    const secretConfig: Record<string, string> = {};
    for (const [key] of secretFields) {
      const v = secretValues[key]?.trim();
      if (v) secretConfig[key] = v;
    }
    if (Object.keys(secretConfig).length === 0) return;
    setRotating(true);
    try {
      const res = await fetch(`/api/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretConfig }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Rotation failed");
      }
      setSecretValues({});
      toast.success("Credentials updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rotation failed");
    } finally {
      setRotating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/installations/${installation.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Uninstall failed");
      }
      toast.success("Uninstalled");
      router.push(postDeleteHref);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Uninstall failed");
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-6 max-w-[800px]">
      {installation.status === "error" && installation.lastError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Verification failed</AlertTitle>
          <AlertDescription>{installation.lastError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>
            How this installation appears in lists and selectors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="displayName" className="sr-only">
            Display name
          </Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveName} disabled={!dirty || savingName}>
            {savingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Current status:{" "}
            <span className="font-medium text-foreground">
              {installation.status}
            </span>
            {installation.lastError && (
              <span className="block text-destructive mt-1">
                {installation.lastError}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={handleVerify} disabled={verifying}>
            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Re-verify
          </Button>
        </CardFooter>
      </Card>

      {secretFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rotate credentials</CardTitle>
            <CardDescription>
              Provide new values to replace the stored secret(s).
              {secretFields.length > 1 && (
                <span className="block mt-1">
                  All secret fields are stored together; provide values for
                  every field you wish to keep.
                </span>
              )}
              {installation.hasSecret ? null : (
                <span className="block mt-1 text-muted-foreground">
                  No credential is currently stored.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {secretFields.map(([key, prop]) => {
              const id = `secret-${key}`;
              const label = prop.title ?? key;
              return (
                <div key={key} className="grid gap-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    value={secretValues[key] ?? ""}
                    onChange={(e) =>
                      setSecretValues((v) => ({
                        ...v,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder="••••••••"
                  />
                  {prop.description && (
                    <p className="text-xs text-muted-foreground">
                      {prop.description}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleRotateSecrets}
              disabled={!hasSecretChanges || rotating}
            >
              {rotating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update credentials
            </Button>
          </CardFooter>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Public configuration</CardTitle>
          <CardDescription>
            Non-sensitive fields stored for this installation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md border bg-muted p-3 text-xs overflow-x-auto">
            {JSON.stringify(installation.configPublic ?? {}, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Removing this installation cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                Uninstall
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Uninstall {integration.name}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Encrypted credentials will be deleted. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  Uninstall
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}
