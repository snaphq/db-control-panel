"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import {
  formatDate,
  formatDateTime,
  isExpired,
  relativeOrNever,
  tokenDisplayName,
} from "./format";
import type { OperatorTokenView } from "./types";

const TH = "px-3 py-2 text-left font-medium";

function TokenName({ token }: { token: OperatorTokenView }) {
  return (
    <>
      <div>{tokenDisplayName(token)}</div>
      <div className="font-mono text-xs text-muted-foreground">
        {token.tokenPrefix}…
      </div>
    </>
  );
}

/** Active (non-revoked) keys with rename and revoke actions. */
export function ActiveTokenTable({
  tokens,
  onRename,
  onRevoke,
}: {
  tokens: OperatorTokenView[];
  onRename: (token: OperatorTokenView) => void;
  onRevoke: (token: OperatorTokenView) => void;
}) {
  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active keys. Add a key to authenticate as this operator.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className={TH}>Key</th>
            <th className={TH}>Created</th>
            <th className={TH}>Expires</th>
            <th className={TH}>Last used</th>
            <th className="px-2 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tokens.map((token) => (
            <tr key={token.id}>
              <td className="px-3 py-2">
                <TokenName token={token} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                <time dateTime={token.createdAt} suppressHydrationWarning>
                  {formatDate(token.createdAt)}
                </time>
              </td>
              <td className="px-3 py-2">
                {isExpired(token.expiresAt) ? (
                  <Badge variant="outline">Expired</Badge>
                ) : (
                  <span suppressHydrationWarning>
                    {formatDate(token.expiresAt)}
                  </span>
                )}
              </td>
              <td
                className="px-3 py-2 text-muted-foreground"
                title={
                  token.lastUsedAt
                    ? formatDateTime(token.lastUsedAt)
                    : undefined
                }
                suppressHydrationWarning
              >
                {relativeOrNever(token.lastUsedAt)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename key ${tokenDisplayName(token)}`}
                  title="Rename"
                  onClick={() => onRename(token)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Revoke key ${tokenDisplayName(token)}`}
                  title="Revoke"
                  onClick={() => onRevoke(token)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Collapsed, read-only history of revoked keys. */
export function RevokedTokenHistory({
  tokens,
}: {
  tokens: OperatorTokenView[];
}) {
  if (tokens.length === 0) return null;

  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
        Revoked keys ({tokens.length})
      </summary>
      <div className="overflow-x-auto border-t">
        <table className="w-full text-sm text-muted-foreground">
          <thead className="border-b bg-muted/40 text-xs uppercase">
            <tr>
              <th className={TH}>Key</th>
              <th className={TH}>Created</th>
              <th className={TH}>Revoked</th>
              <th className={TH}>Last used</th>
            </tr>
          </thead>
          <tbody className="divide-y opacity-80">
            {tokens.map((token) => (
              <tr key={token.id}>
                <td className="px-3 py-2">
                  <TokenName token={token} />
                </td>
                <td className="px-3 py-2" suppressHydrationWarning>
                  {formatDate(token.createdAt)}
                </td>
                <td className="px-3 py-2" suppressHydrationWarning>
                  {formatDate(token.revokedAt)}
                </td>
                <td className="px-3 py-2" suppressHydrationWarning>
                  {relativeOrNever(token.lastUsedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
