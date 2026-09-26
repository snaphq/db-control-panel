"use client";

import { passkey } from "@repo/auth/client";
import { KeyRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

type PasskeyEntry = {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
  deviceType?: string | null;
};

export function PasskeyCard() {
  const [items, setItems] = useState<PasskeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await passkey.list();
    if (result.error) {
      setError(result.error.message ?? "Failed to load passkeys.");
    } else {
      setItems((result.data as PasskeyEntry[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = async () => {
    setAdding(true);
    setError(null);
    try {
      const result = await passkey.add({ name: name.trim() || undefined });
      if (result?.error) {
        setError(result.error.message ?? "Failed to register passkey.");
        return;
      }
      setShowAdd(false);
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register.");
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async (id: string) => {
    setPendingDelete(id);
    setError(null);
    try {
      const result = await passkey.delete({ id });
      if (result.error) {
        setError(result.error.message ?? "Failed to delete passkey.");
        return;
      }
      await refresh();
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Passkeys</CardTitle>
            <CardDescription>
              Sign in without a password using device biometrics or security
              keys.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            Add passkey
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">
            No passkeys registered yet.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">
                      {p.name || "Unnamed passkey"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.deviceType ? `${p.deviceType} · ` : ""}
                      {p.createdAt
                        ? `Added ${new Date(p.createdAt).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingDelete === p.id}
                  onClick={() => onDelete(p.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p className="px-6 py-3 text-sm text-destructive">{error}</p>
        ) : null}
      </CardContent>

      <Dialog
        open={showAdd}
        onOpenChange={(open) => {
          if (!open) {
            setShowAdd(false);
            setName("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
            <DialogDescription>
              You&apos;ll be prompted by your browser to use biometrics or a
              security key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="passkey-name">Name (optional)</Label>
            <Input
              id="passkey-name"
              placeholder="e.g. MacBook Touch ID"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowAdd(false)}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button onClick={onAdd} disabled={adding}>
              {adding ? "Waiting for device..." : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardContent className="border-t pt-4">
        <Badge variant="outline">WebAuthn / FIDO2</Badge>
      </CardContent>
    </Card>
  );
}
