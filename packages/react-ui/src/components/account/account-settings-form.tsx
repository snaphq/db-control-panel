"use client";

import { refetchSession } from "@repo/auth/client";
import { upload } from "@repo/object-storage/client";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
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

interface AccountSettingsFormProps {
  userId: string;
  initialName: string;
  initialUsername: string;
  initialImage: string;
  email: string;
}

const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 4 * 1024 * 1024;

async function patchAccount(body: Record<string, unknown>) {
  const res = await fetch("/api/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error ?? "Update failed");
  }
  // Invalidate the better-auth client session so useSession() consumers
  // (e.g. the sidebar user menu) pick up the new name/image immediately.
  await refetchSession().catch(() => {});
  return payload;
}

export function AccountSettingsForm({
  userId,
  initialName,
  initialUsername,
  initialImage,
  email,
}: AccountSettingsFormProps) {
  const router = useRouter();

  const [image, setImage] = useState(initialImage);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);

  const [username, setUsername] = useState(initialUsername);
  const [savedUsername, setSavedUsername] = useState(initialUsername);
  const [savingUsername, setSavingUsername] = useState(false);

  const trimmedName = name.trim();
  const nameDirty = trimmedName !== savedName;
  const nameValid = trimmedName.length >= 2;

  const normalizedUsername = username.trim().toLowerCase();
  const usernameDirty = normalizedUsername !== savedUsername;
  const usernameValid =
    normalizedUsername === "" || USERNAME_REGEX.test(normalizedUsername);

  const initial = (name?.[0] || email?.[0] || "U").toUpperCase();

  async function handleAvatarChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 4 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const pathname = `avatars/${userId}/${Date.now()}.${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/account/avatar/upload",
        contentType: file.type,
      });
      await patchAccount({ image: blob.url });
      setImage(blob.url);
      toast.success("Avatar updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true);
    try {
      await patchAccount({ image: null });
      setImage("");
      toast.success("Avatar removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveName() {
    if (!nameDirty || !nameValid) return;
    setSavingName(true);
    try {
      await patchAccount({ name: trimmedName });
      setSavedName(trimmedName);
      toast.success("Display name updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveUsername() {
    if (!usernameDirty || !usernameValid) return;
    setSavingUsername(true);
    try {
      await patchAccount({
        username: normalizedUsername === "" ? null : normalizedUsername,
      });
      setSavedUsername(normalizedUsername);
      toast.success("Username updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingUsername(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>PNG, JPEG, WebP, or GIF. Max 4 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={image || undefined} alt={name || "User"} />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-3.5 w-3.5" />
                )}
                Upload
              </Button>
              {image && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={uploading}
                  onClick={handleRemoveAvatar}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Your avatar is shown in the sidebar and across shared workspaces.
          </p>
        </CardFooter>
      </Card>

      {/* Display Name */}
      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
          <CardDescription>
            Shown to teammates across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xl"
            placeholder="Ada Lovelace"
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Use 2 characters or more.
          </p>
          <Button
            size="sm"
            onClick={handleSaveName}
            disabled={!nameDirty || !nameValid || savingName}
          >
            {savingName && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Username */}
      <Card>
        <CardHeader>
          <CardTitle>Username</CardTitle>
          <CardDescription>
            A unique handle. Lowercase letters, numbers, underscores and dashes;
            3–32 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="max-w-xl"
            placeholder="ada"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Leave blank to remove your username.
          </p>
          <Button
            size="sm"
            onClick={handleSaveUsername}
            disabled={!usernameDirty || !usernameValid || savingUsername}
          >
            {savingUsername && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
