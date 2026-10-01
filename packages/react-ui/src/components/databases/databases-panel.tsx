"use client";

import type { DatabasesOverview } from "@repo/core/control-plane/overview";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { CreateNeonDialog } from "./create-neon-dialog";
import { EmptyState } from "./empty-state";
import { LibsqlSection } from "./libsql-section";
import { NeonProjectCard } from "./neon-project-card";
import { OperationsBanner } from "./operations-banner";
import { SecretDialog } from "./secret-dialog";
import { useDatabasesController } from "./use-databases-controller";

interface DatabasesPanelProps {
  projectId: string;
  initial: DatabasesOverview;
  /** Owners and admins; other members get a read-only view. */
  canManage: boolean;
}

export function DatabasesPanel({
  projectId,
  initial,
  canManage,
}: DatabasesPanelProps) {
  const controller = useDatabasesController(projectId, initial, canManage);
  const { overview } = controller;

  const createNeon = canManage ? (
    <CreateNeonDialog
      onCreate={controller.createProject}
      trigger={
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Create Postgres database
        </Button>
      }
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <OperationsBanner
        operations={controller.operations}
        onDismiss={controller.dismissOperation}
      />
      {controller.loadError && (
        <Alert variant="destructive">
          <AlertDescription>{controller.loadError}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="postgres">
        <TabsList>
          <TabsTrigger value="postgres">
            Postgres ({overview.neon.length})
          </TabsTrigger>
          <TabsTrigger value="libsql">
            libSQL ({overview.libsql.databases.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="postgres" className="flex flex-col gap-4">
          {overview.neon.length === 0 ? (
            <EmptyState
              title="No Postgres database yet"
              description="Create a serverless Postgres 17 database for this project. It comes with a main branch, a compute that suspends when idle, an owner role and a database, plus connection strings, branching and an optional REST Data API."
              action={createNeon}
              note={
                canManage
                  ? null
                  : "Ask a workspace owner or admin to create it."
              }
            />
          ) : (
            overview.neon.map((view) => (
              <NeonProjectCard
                key={view.project.id}
                view={view}
                actions={controller.neon}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="libsql">
          <LibsqlSection
            databases={overview.libsql.databases}
            loadError={overview.libsql.error}
            canManage={canManage}
            onCreate={controller.libsql.create}
            onIssueToken={controller.libsql.issueToken}
            onRequestDelete={controller.libsql.requestDelete}
          />
        </TabsContent>
      </Tabs>

      <SecretDialog
        secret={controller.secret}
        onClose={controller.closeSecret}
      />
      <ConfirmDeleteDialog
        target={controller.confirm}
        onClose={controller.closeConfirm}
      />
    </div>
  );
}
