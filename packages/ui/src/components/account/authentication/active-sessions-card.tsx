"use client";

import { Loader2, Monitor } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";

type AccountSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

function relativeTime(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)?.[1];
  const os = ua.match(/(Windows|Mac OS X|Linux|Android|iOS|iPhone|iPad)/)?.[1];
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.slice(0, 60);
}

export function ActiveSessionsCard() {
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = async (id: string) => {
    setPendingId(id);
    try {
      await fetch(`/api/account/sessions/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  const revokeOthers = async () => {
    setPendingId("all-others");
    try {
      await fetch("/api/account/sessions/all-others", { method: "DELETE" });
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  const others = (sessions ?? []).filter((s) => !s.isCurrent);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            Devices currently signed in to your account.
          </CardDescription>
        </div>
        {others.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pendingId === "all-others"}
            onClick={revokeOthers}
          >
            {pendingId === "all-others"
              ? "Signing out..."
              : "Sign out other sessions"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {sessions === null ? (
          <div className="flex items-center justify-center px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No active sessions.
          </div>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">
                        {summarizeUserAgent(s.userAgent)}
                      </span>
                      {s.isCurrent ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.ipAddress ?? "unknown ip"} · last active{" "}
                      {relativeTime(s.updatedAt)}
                    </div>
                  </div>
                </div>
                {!s.isCurrent ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingId === s.id}
                    onClick={() => revoke(s.id)}
                  >
                    {pendingId === s.id ? "Revoking..." : "Revoke"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
