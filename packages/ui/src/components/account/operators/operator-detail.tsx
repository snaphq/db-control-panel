"use client";

import type {
  OperatorActivityView,
  OperatorDetailView,
  OperatorOrganizationOption,
  OperatorTokenView,
} from "@repo/core/operators/view-types";
import { ArrowLeft, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { AddTokenDialog } from "./add-token-dialog";
import { ConfirmRevokeDialog } from "./confirm-revoke-dialog";
import {
  OPERATORS_PATH,
  formatDate,
  normalizeOperator,
  readError,
  scopeLabel,
  tokenDisplayName,
} from "./format";
import { OperatorActivity } from "./operator-activity";
import { OperatorFormDialog } from "./operator-form-dialog";
import { OperatorStatusBadge } from "./operator-status-badge";
import { PlaintextDialog } from "./plaintext-dialog";
import { RenameTokenDialog } from "./rename-token-dialog";
import { ActiveTokenTable, RevokedTokenHistory } from "./token-table";

type RevokeTarget =
  | { kind: "operator" }
  | { kind: "token"; token: OperatorTokenView };

export function OperatorDetail({
  initialOperator,
  initialActivity,
  organizations,
}: {
  initialOperator: OperatorDetailView;
  initialActivity: OperatorActivityView[];
  organizations: OperatorOrganizationOption[];
}) {
  const router = useRouter();
  const [operator, setOperator] = useState(initialOperator);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<OperatorTokenView | null>(
    null,
  );
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const active = operator.status === "active";
  const activeTokens = operator.tokens.filter((t) => t.revokedAt === null);
  const revokedTokens = operator.tokens.filter((t) => t.revokedAt !== null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/account/operators/${operator.id}`, {
      credentials: "same-origin",
    });
    if (res.status === 404) {
      toast.error("Operator no longer exists");
      router.push(OPERATORS_PATH);
      return;
    }
    if (!res.ok) {
      toast.error(await readError(res));
      return;
    }
    const data = (await res.json()) as { operator: OperatorDetailView };
    setOperator(normalizeOperator(data.operator));
  }, [operator.id, router]);

  const toggleStatus = async () => {
    const status = active ? "suspended" : "active";
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/account/operators/${operator.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      toast.success(active ? "Operator suspended" : "Operator resumed");
      await refresh();
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmRevoke = async (): Promise<boolean> => {
    if (!revokeTarget) return true;
    const url =
      revokeTarget.kind === "token"
        ? `/api/account/operators/${operator.id}/tokens/${revokeTarget.token.id}`
        : `/api/account/operators/${operator.id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readError(res));
      return false;
    }
    if (revokeTarget.kind === "operator") {
      toast.success("Operator revoked");
      router.push(OPERATORS_PATH);
      router.refresh();
      return true;
    }
    toast.success("Key revoked");
    await refresh();
    return true;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={OPERATORS_PATH}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Operators
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-normal tracking-tight">
              {operator.name}
            </h1>
            <OperatorStatusBadge status={operator.status} />
          </div>
          {operator.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {operator.description}
            </p>
          ) : null}
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div>
              <dt className="inline">Scope: </dt>
              <dd className="inline text-foreground">
                {scopeLabel(operator.scope, organizations)}
              </dd>
            </div>
            <div>
              <dt className="inline">Created: </dt>
              <dd className="inline" suppressHydrationWarning>
                {formatDate(operator.createdAt)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleStatus()}
            disabled={statusBusy}
          >
            {active ? (
              <>
                <Pause className="mr-1 h-4 w-4" /> Suspend
              </>
            ) : (
              <>
                <Play className="mr-1 h-4 w-4" /> Resume
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setRevokeTarget({ kind: "operator" })}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Revoke
          </Button>
        </div>
      </div>

      {!active ? (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          This operator is suspended. Its keys do not authenticate until you
          resume it.
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Active keys</CardTitle>
            <CardDescription>
              Each key authenticates as this operator. Rotate by adding a new
              key, switching your integration, then revoking the old one.
            </CardDescription>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            disabled={!active}
            title={active ? undefined : "Resume the operator to add keys"}
          >
            <Plus className="mr-1 h-4 w-4" /> Add key
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActiveTokenTable
            tokens={activeTokens}
            onRename={setRenameTarget}
            onRevoke={(token) => setRevokeTarget({ kind: "token", token })}
          />
          <RevokedTokenHistory tokens={revokedTokens} />
        </CardContent>
      </Card>

      <OperatorActivity
        operatorId={operator.id}
        tokens={operator.tokens}
        initialEntries={initialActivity}
      />

      <OperatorFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        organizations={organizations}
        operator={editOpen ? operator : null}
        onSaved={refresh}
      />

      <AddTokenDialog
        operator={addOpen ? operator : null}
        onOpenChange={setAddOpen}
        onCreated={(value) => {
          setPlaintext(value);
          void refresh();
        }}
      />

      <PlaintextDialog value={plaintext} onClose={() => setPlaintext(null)} />

      <RenameTokenDialog
        operatorId={operator.id}
        token={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRenamed={async () => {
          toast.success("Key renamed");
          await refresh();
        }}
      />

      <ConfirmRevokeDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={
          revokeTarget?.kind === "token" ? "Revoke key" : "Revoke operator"
        }
        description={
          revokeTarget?.kind === "token"
            ? `${tokenDisplayName(revokeTarget.token)} (${revokeTarget.token.tokenPrefix}…) stops authenticating immediately. This cannot be undone.`
            : "This operator and all of its keys stop authenticating immediately. This cannot be undone."
        }
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
