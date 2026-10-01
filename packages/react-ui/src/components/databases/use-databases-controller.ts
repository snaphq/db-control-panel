"use client";

import type {
  CreateLibsqlTokenRequest,
  CreateProjectRequest,
  LibsqlDatabase,
  Operation,
} from "@repo/control-plane-contract";
import type { DatabasesOverview } from "@repo/core/control-plane/overview";
import { useCallback, useMemo, useState } from "react";
import { databasesApi, errorMessage } from "./api";
import type { DeleteTarget } from "./confirm-delete-dialog";
import type { NeonActions } from "./neon-actions";
import type { RevealedSecret } from "./secret-dialog";
import { useOperationTracker } from "./use-operation-tracker";

interface LibsqlActions {
  create: (name: string) => Promise<void>;
  issueToken: (
    database: LibsqlDatabase,
    body: CreateLibsqlTokenRequest,
  ) => Promise<void>;
  requestDelete: (database: LibsqlDatabase) => void;
}

/**
 * State and actions of the Databases tab. Every mutation answers with an
 * operation; the controller tracks it until it settles and reloads the
 * overview on each status change, so the page follows the control plane
 * without a full refresh.
 */
export function useDatabasesController(
  projectId: string,
  initial: DatabasesOverview,
  canManage: boolean,
) {
  const api = useMemo(() => databasesApi(projectId), [projectId]);
  const [overview, setOverview] = useState(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [secret, setSecret] = useState<RevealedSecret | null>(null);
  const [confirm, setConfirm] = useState<DeleteTarget | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.overview());
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [api]);

  const tracker = useOperationTracker(
    api,
    () => {
      void refresh();
    },
    (error) =>
      setLoadError(
        `Could not check for running operations: ${errorMessage(error)}`,
      ),
  );

  const started = useCallback(
    async (label: string, operation: Operation) => {
      tracker.track(operation, label);
      await refresh();
    },
    [tracker.track, refresh],
  );

  const neon: NeonActions = {
    canManage,
    async createBranch(neonId, body) {
      const result = await api.createBranch(neonId, body);
      await started(`Creating branch ${body.name}`, result.operation);
    },
    requestDeleteBranch(neonId, branch) {
      setConfirm({
        name: branch.name,
        title: `Delete branch ${branch.name}?`,
        description:
          "The branch, its data and its compute endpoints are removed. This cannot be undone.",
        onConfirm: async () => {
          const result = await api.deleteBranch(neonId, branch.id);
          await started(`Deleting branch ${branch.name}`, result.operation);
        },
      });
    },
    requestDeleteProject(project) {
      setConfirm({
        name: project.name,
        title: `Delete ${project.name}?`,
        description:
          "Every branch, endpoint, role and database in this project is permanently deleted. This cannot be undone.",
        onConfirm: async () => {
          const result = await api.deleteProject(project.id);
          await started(`Deleting ${project.name}`, result.operation);
        },
      });
    },
    requestResetPassword(neonId, branchId, role) {
      setConfirm({
        actionLabel: "Reset password",
        title: `Reset the password of ${role}?`,
        description:
          "Applications using the current password lose access until they are updated. The new password is shown once.",
        onConfirm: async () => {
          const result = await api.resetPassword(neonId, branchId, role);
          setSecret({
            title: `New password for ${role}`,
            description: "Use it in your connection strings.",
            fields: [
              { label: "Role", value: result.role.name },
              { label: "Password", value: result.role.password },
            ],
          });
          await started(`Resetting password of ${role}`, result.operation);
        },
      });
    },
    async endpointAction(neonId, endpointId, action) {
      const result = await api.endpointAction(neonId, endpointId, action);
      await started(
        `${action === "start" ? "Starting" : "Suspending"} ${endpointId}`,
        result.operation,
      );
    },
    async setDataApi(neonId, branchId, database, enabled) {
      const result = await api.setDataApi(neonId, branchId, database, enabled);
      await started(
        `${enabled ? "Enabling" : "Disabling"} Data API on ${database}`,
        result.operation,
      );
    },
  };

  const libsql: LibsqlActions = {
    async create(name) {
      const result = await api.createLibsql(name);
      await started(`Creating ${name}`, result.operation);
    },
    async issueToken(database, body) {
      const result = await api.createToken(database.id, body);
      setSecret({
        title: `Token for ${database.name}`,
        description: result.expires_at
          ? `Valid until ${new Date(result.expires_at).toLocaleString()}.`
          : "This token never expires.",
        fields: [
          { label: "Database URL", value: database.url },
          { label: "Auth token", value: result.token },
        ],
      });
    },
    requestDelete(database) {
      setConfirm({
        name: database.name,
        title: `Delete ${database.name}?`,
        description:
          "The database and all of its data are permanently deleted, and its tokens stop working.",
        onConfirm: async () => {
          const result = await api.deleteLibsql(database.id);
          await started(`Deleting ${database.name}`, result.operation);
        },
      });
    },
  };

  async function createProject(body: CreateProjectRequest): Promise<void> {
    const result = await api.createProject(body);
    const owner = result.roles[0];
    const uri = result.connection_uris[0];
    setSecret({
      title: `${result.project.name} is being created`,
      description: "These credentials belong to the database owner role.",
      fields: [
        ...(owner
          ? [
              { label: "Role", value: owner.name },
              { label: "Password", value: owner.password },
            ]
          : []),
        ...(uri
          ? [{ label: "Connection string", value: uri.connection_uri }]
          : []),
      ],
    });
    await started(`Creating ${result.project.name}`, result.operation);
  }

  return {
    overview,
    loadError,
    secret,
    closeSecret: () => setSecret(null),
    confirm,
    closeConfirm: () => setConfirm(null),
    operations: tracker.operations,
    dismissOperation: tracker.dismiss,
    createProject,
    neon,
    libsql,
  };
}
