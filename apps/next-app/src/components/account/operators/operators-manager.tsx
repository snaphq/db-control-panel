"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  formatDate,
  isExpired,
  normalizeOperator,
  operatorPath,
  scopeLabel,
} from "./format";
import { OperatorFormDialog } from "./operator-form-dialog";
import { OperatorStatusBadge } from "./operator-status-badge";
import { PlaintextDialog } from "./plaintext-dialog";
import type { OperatorOrganizationOption, OperatorView } from "./types";

function keySummary(operator: OperatorView): string {
  const active = operator.tokens.filter((token) => token.revokedAt === null);
  const expired = active.filter((token) => isExpired(token.expiresAt)).length;
  const count = `${active.length} active ${active.length === 1 ? "key" : "keys"}`;
  return expired > 0 ? `${count} (${expired} expired)` : count;
}

export function OperatorsManager({
  initialOperators,
  organizations,
}: {
  initialOperators: OperatorView[];
  organizations: OperatorOrganizationOption[];
}) {
  const router = useRouter();
  const [operators, setOperators] = useState(initialOperators);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<{
    plaintext: string;
    operatorId: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account/operators", {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      operators: Parameters<typeof normalizeOperator>[0][];
    };
    setOperators(data.operators.map(normalizeOperator));
  }, []);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Operators</CardTitle>
            <CardDescription>
              Programmatic access via MCP and APIs. Open an operator to manage
              its keys and review recent activity.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New operator
          </Button>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No operators yet. Create one to authenticate programmatic
              requests.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {operators.map((operator) => (
                <li key={operator.id}>
                  <Link
                    href={operatorPath(operator.id)}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {operator.name}
                        </span>
                        <OperatorStatusBadge status={operator.status} />
                      </div>
                      {operator.description ? (
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {operator.description}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{scopeLabel(operator.scope, organizations)}</span>
                        <span aria-hidden>·</span>
                        <span suppressHydrationWarning>
                          {keySummary(operator)}
                        </span>
                        <span aria-hidden>·</span>
                        <span suppressHydrationWarning>
                          Created {formatDate(operator.createdAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <OperatorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={organizations}
        onSaved={refresh}
        onCreated={(plaintext, operatorId) =>
          setCreated({ plaintext, operatorId })
        }
      />

      <PlaintextDialog
        value={created?.plaintext ?? null}
        onClose={() => setCreated(null)}
        continueLabel="Open operator"
        onContinue={() => {
          if (!created) return;
          const href = operatorPath(created.operatorId);
          setCreated(null);
          router.push(href);
        }}
      />
    </>
  );
}
