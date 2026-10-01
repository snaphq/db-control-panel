import type { Operation, OperationAction } from "@repo/control-plane-contract";

const LABELS: Record<OperationAction, string> = {
  "project.create": "Creating the Postgres database",
  "project.delete": "Deleting the Postgres database",
  "branch.create": "Creating a branch",
  "branch.delete": "Deleting a branch",
  "endpoint.start": "Starting a compute endpoint",
  "endpoint.suspend": "Suspending a compute endpoint",
  "endpoint.update": "Updating a compute endpoint",
  "role.reset_password": "Updating a role password",
  "database.create": "Creating a database",
  "database.delete": "Deleting a database",
  "data_api.enable": "Enabling the Data API",
  "data_api.disable": "Disabling the Data API",
  "libsql.create": "Creating a libSQL database",
  "libsql.delete": "Deleting a libSQL database",
  "libsql.fork": "Forking a libSQL database",
};

/**
 * A label for an operation this page did not start itself (one found after a
 * reload), where the name the user typed is no longer known.
 */
export function describeOperation(
  operation: Pick<Operation, "action">,
): string {
  return LABELS[operation.action];
}
