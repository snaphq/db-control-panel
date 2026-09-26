"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { SELECT_CLASS_NAME } from "./expirations";
import {
  ACTIVITY_LIMIT,
  formatDateTime,
  readError,
  relativeOrNever,
  tokenDisplayName,
} from "./format";
import type { OperatorActivityView, OperatorTokenView } from "./types";

const ALL_KEYS = "";

function humanizeEvent(eventType: string): string {
  const stripped = eventType.replace(/^mcp_/, "").replace(/_/g, " ");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function ActivityStatus({ entry }: { entry: OperatorActivityView }) {
  const code = entry.statusCode !== null ? ` ${entry.statusCode}` : "";
  if (entry.success === true) {
    return <Badge variant="outline">OK{code}</Badge>;
  }
  if (entry.success === false) {
    return <Badge variant="destructive">Failed{code}</Badge>;
  }
  if (entry.statusCode !== null) {
    return <Badge variant="secondary">{entry.statusCode}</Badge>;
  }
  return <span className="text-muted-foreground">—</span>;
}

export function OperatorActivity({
  operatorId,
  tokens,
  initialEntries,
}: {
  operatorId: string;
  /** All keys, including revoked ones, for label resolution and filtering. */
  tokens: OperatorTokenView[];
  initialEntries: OperatorActivityView[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [credentialId, setCredentialId] = useState<string>(ALL_KEYS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (nextCredentialId: string) => {
      const current = ++requestId.current;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: String(ACTIVITY_LIMIT) });
      if (nextCredentialId) params.set("credentialId", nextCredentialId);
      try {
        const res = await fetch(
          `/api/account/operators/${operatorId}/activity?${params}`,
          { credentials: "same-origin" },
        );
        if (current !== requestId.current) return;
        if (!res.ok) {
          setError(await readError(res));
          return;
        }
        const data = (await res.json()) as { entries: OperatorActivityView[] };
        setEntries(data.entries);
      } catch {
        if (current === requestId.current) {
          setError("Could not load activity");
        }
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [operatorId],
  );

  const tokensById = new Map(tokens.map((token) => [token.id, token]));

  const keyLabel = (id: string | null): string => {
    if (!id) return "—";
    const token = tokensById.get(id);
    if (!token) return "Unknown key";
    return `${tokenDisplayName(token)} (${token.tokenPrefix}…)`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            The latest {ACTIVITY_LIMIT} requests made with this operator&apos;s
            keys.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="activity-key-filter" className="sr-only">
            Filter activity by key
          </label>
          <select
            id="activity-key-filter"
            value={credentialId}
            onChange={(e) => {
              setCredentialId(e.target.value);
              void load(e.target.value);
            }}
            className={cn(SELECT_CLASS_NAME, "mt-0 w-48")}
          >
            <option value={ALL_KEYS}>All keys</option>
            {tokens.map((token) => (
              <option key={token.id} value={token.id}>
                {tokenDisplayName(token)} ({token.tokenPrefix}…)
                {token.revokedAt ? " — revoked" : ""}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh activity"
            title="Refresh"
            onClick={() => void load(credentialId)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="mb-3 text-sm text-destructive">{error}</p>
        ) : null}
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {credentialId
              ? "No activity for this key yet."
              : "No activity yet. Requests made with this operator's keys appear here."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Key</th>
                  <th className="px-3 py-2 text-left font-medium">Event</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td
                      className="whitespace-nowrap px-3 py-2 text-muted-foreground"
                      title={formatDateTime(entry.createdAt)}
                      suppressHydrationWarning
                    >
                      {relativeOrNever(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {keyLabel(entry.credentialId)}
                    </td>
                    <td className="px-3 py-2">
                      <div>{humanizeEvent(entry.eventType)}</div>
                      {entry.toolName || entry.method ? (
                        <div className="font-mono text-xs text-muted-foreground">
                          {entry.toolName ?? entry.method}
                        </div>
                      ) : null}
                      {entry.error ? (
                        <div
                          className="mt-1 max-w-[320px] truncate text-xs text-destructive"
                          title={entry.error}
                        >
                          {entry.error}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <ActivityStatus entry={entry} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
                      {entry.durationMs !== null
                        ? `${entry.durationMs} ms`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
