"use client";

import { signIn } from "@repo/auth/client";
import { Github, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";

type Linked = { email: boolean; google: boolean; github: boolean };
type Provider = "google" | "github";

export function SignInMethodsCard({
  email,
  linked,
  googleEnabled,
  githubEnabled,
}: {
  email: string;
  linked: Linked;
  googleEnabled: boolean;
  githubEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otherLinkedCount =
    (linked.email ? 1 : 0) + (linked.google ? 1 : 0) + (linked.github ? 1 : 0);

  const connect = async (provider: Provider) => {
    setError(null);
    setPending(provider);
    try {
      await signIn.social({
        provider,
        callbackURL: "/account/settings/authentication",
      });
    } finally {
      setPending(null);
    }
  };

  const disconnect = async (provider: Provider) => {
    setError(null);
    setPending(provider);
    try {
      const res = await fetch(`/api/account/social/${provider}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "last_sign_in_method") {
          setError(
            "Cannot disconnect your only sign-in method. Add another first.",
          );
        } else {
          setError("Failed to disconnect.");
        }
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in Methods</CardTitle>
        <CardDescription>
          Choose how you want to sign in to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          <li className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Email</div>
                <div className="text-xs text-muted-foreground">{email}</div>
              </div>
            </div>
            <Badge variant={linked.email ? "secondary" : "outline"}>
              {linked.email ? "Active" : "Not configured"}
            </Badge>
          </li>

          <SocialRow
            provider="google"
            label="Google"
            icon={<GoogleIcon className="h-5 w-5" />}
            enabled={googleEnabled}
            connected={linked.google}
            pending={pending === "google"}
            canDisconnect={otherLinkedCount > 1}
            onConnect={() => connect("google")}
            onDisconnect={() => disconnect("google")}
          />

          <SocialRow
            provider="github"
            label="GitHub"
            icon={<Github className="h-5 w-5 text-muted-foreground" />}
            enabled={githubEnabled}
            connected={linked.github}
            pending={pending === "github"}
            canDisconnect={otherLinkedCount > 1}
            onConnect={() => connect("github")}
            onDisconnect={() => disconnect("github")}
          />

          {error ? (
            <li className="px-6 py-3 text-sm text-destructive">{error}</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function SocialRow({
  label,
  icon,
  enabled,
  connected,
  pending,
  canDisconnect,
  onConnect,
  onDisconnect,
}: {
  provider: Provider;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  connected: boolean;
  pending: boolean;
  canDisconnect: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <li className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">
            {enabled
              ? connected
                ? "Connected"
                : "Not connected"
              : "Disabled by administrator"}
          </div>
        </div>
      </div>
      {enabled ? (
        connected ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !canDisconnect}
            title={
              !canDisconnect
                ? "Add another sign-in method before disconnecting"
                : undefined
            }
            onClick={onDisconnect}
          >
            {pending ? "Disconnecting..." : "Disconnect"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onConnect}
          >
            {pending ? "Redirecting..." : "Connect"}
          </Button>
        )
      ) : (
        <Badge variant="outline">Unavailable</Badge>
      )}
    </li>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Google"
    >
      <title>Google</title>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.1-1.6H12z"
      />
    </svg>
  );
}
