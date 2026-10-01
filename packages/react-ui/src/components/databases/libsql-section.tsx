"use client";

import type {
  CreateLibsqlTokenRequest,
  LibsqlDatabase,
} from "@repo/control-plane-contract";
import { Plus } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { CopyField } from "./copy-field";
import { CreateLibsqlDialog } from "./create-libsql-dialog";
import { EmptyState } from "./empty-state";
import { LibsqlTokenDialog } from "./libsql-token-dialog";

interface LibsqlSectionProps {
  databases: LibsqlDatabase[];
  loadError: string | null;
  canManage: boolean;
  onCreate: (name: string) => Promise<void>;
  onIssueToken: (
    database: LibsqlDatabase,
    body: CreateLibsqlTokenRequest,
  ) => Promise<void>;
  onRequestDelete: (database: LibsqlDatabase) => void;
}

export function LibsqlSection({
  databases,
  loadError,
  canManage,
  onCreate,
  onIssueToken,
  onRequestDelete,
}: LibsqlSectionProps) {
  const create = canManage ? (
    <CreateLibsqlDialog
      onCreate={onCreate}
      trigger={
        <Button size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          New libSQL database
        </Button>
      }
    />
  ) : null;

  if (loadError) {
    return (
      <EmptyState
        title="libSQL databases are unavailable"
        description={loadError}
      />
    );
  }
  if (databases.length === 0) {
    return (
      <EmptyState
        title="No libSQL databases yet"
        description="libSQL databases are lightweight SQLite-compatible databases, a good fit for per-user or per-tenant data. Create one, then issue a token to connect with any libSQL client."
        action={create}
        note={
          canManage ? null : "Ask a workspace owner or admin to create one."
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {create && <div className="flex justify-end">{create}</div>}
      {databases.map((database) => (
        <Card key={database.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>{database.name}</CardTitle>
              <CardDescription>
                <Badge variant="secondary">{database.state}</Badge>
              </CardDescription>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <LibsqlTokenDialog
                  databaseName={database.name}
                  onIssue={(body) => onIssueToken(database, body)}
                  trigger={
                    <Button size="sm" variant="outline">
                      Issue token
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onRequestDelete(database)}
                >
                  Delete
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CopyField label="Database URL" value={database.url} />
            <p className="text-xs text-muted-foreground">
              Connect with the URL above and a token as the auth token, for
              example{" "}
              <code>
                createClient({"{"} url, authToken {"}"})
              </code>{" "}
              in
              <code> @libsql/client</code>.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
