"use client";

import type { Endpoint } from "@repo/control-plane-contract";
import type { NeonBranchView } from "@repo/core/control-plane/overview";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ActionButton } from "./action-button";
import type { NeonActions } from "./neon-actions";
import { NeonEndpointRow } from "./neon-endpoint-row";

interface NeonBranchSectionProps {
  neonId: string;
  view: NeonBranchView;
  parentName: string | null;
  endpoints: Endpoint[];
  actions: NeonActions;
}

/** One branch: its endpoints, roles and databases. */
export function NeonBranchSection({
  neonId,
  view,
  parentName,
  endpoints,
  actions,
}: NeonBranchSectionProps) {
  const { branch, roles, databases } = view;
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{branch.name}</h4>
        {branch.is_default && <Badge variant="secondary">Default</Badge>}
        {parentName && (
          <span className="text-xs text-muted-foreground">
            from {parentName}
            {branch.parent_lsn ? ` at ${branch.parent_lsn}` : ""}
          </span>
        )}
        {actions.canManage && !branch.is_default && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => actions.requestDeleteBranch(neonId, branch)}
          >
            Delete branch
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-2">
        <h5 className="text-xs font-medium uppercase text-muted-foreground">
          Compute endpoints
        </h5>
        {endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This branch has no compute endpoint, so nothing can connect to it
            yet.
          </p>
        ) : (
          endpoints.map((endpoint) => (
            <NeonEndpointRow
              key={endpoint.id}
              neonId={neonId}
              endpoint={endpoint}
              roles={roles}
              databases={databases}
              actions={actions}
            />
          ))
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h5 className="text-xs font-medium uppercase text-muted-foreground">
            Roles
          </h5>
          {roles.map((role) => (
            <div
              key={role.name}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="font-mono">{role.name}</span>
              {actions.canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    actions.requestResetPassword(neonId, branch.id, role.name)
                  }
                >
                  Reset password
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h5 className="text-xs font-medium uppercase text-muted-foreground">
            Databases
          </h5>
          {databases.map((database) => (
            <div
              key={database.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono">{database.name}</span>
                <span className="text-xs text-muted-foreground">
                  owner {database.owner_name}
                </span>
                {database.data_api_enabled && <Badge>Data API</Badge>}
              </span>
              {actions.canManage && (
                <ActionButton
                  size="sm"
                  variant="outline"
                  onAction={() =>
                    actions.setDataApi(
                      neonId,
                      branch.id,
                      database.name,
                      !database.data_api_enabled,
                    )
                  }
                >
                  {database.data_api_enabled
                    ? "Disable Data API"
                    : "Enable Data API"}
                </ActionButton>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
