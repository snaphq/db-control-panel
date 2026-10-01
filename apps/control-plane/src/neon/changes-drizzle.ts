import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import {
  branch,
  database,
  endpoint,
  libsqlDatabase,
  neonProject,
  role,
} from '../db/schema.js';
import type { DesiredStateChange } from './store.js';

/** Applies one row-level change of an operation's desired state inside its transaction. */
export async function applyChange(
  tx: Transaction,
  change: DesiredStateChange,
): Promise<void> {
  switch (change.kind) {
    case 'project.insert':
      await tx.insert(neonProject).values(change.row);
      return;
    case 'project.markDeleted':
      await tx
        .update(neonProject)
        .set({ deletedAt: sql`now()` })
        .where(eq(neonProject.id, change.id));
      return;
    case 'branch.insert':
      await tx.insert(branch).values(change.row);
      return;
    case 'branch.markDeleted':
      if (change.ids.length === 0) return;
      await tx
        .update(branch)
        .set({ deletedAt: sql`now()` })
        .where(inArray(branch.id, change.ids));
      return;
    case 'endpoint.insert':
      await tx.insert(endpoint).values(change.row);
      return;
    case 'endpoint.update':
      await tx
        .update(endpoint)
        .set(change.set)
        .where(eq(endpoint.id, change.id));
      return;
    case 'endpoint.markDeleted':
      if (change.ids.length === 0) return;
      await tx
        .update(endpoint)
        .set({ deletedAt: sql`now()` })
        .where(inArray(endpoint.id, change.ids));
      return;
    case 'role.insert':
      await tx.insert(role).values(change.row);
      return;
    case 'role.setSecret':
      await tx
        .update(role)
        .set({
          scramSecret: change.scramSecret,
          ...(change.passwordEnc === undefined
            ? {}
            : { passwordEnc: change.passwordEnc }),
        })
        .where(
          and(eq(role.branchId, change.branchId), eq(role.name, change.name)),
        );
      return;
    case 'database.insert':
      await tx.insert(database).values(change.row);
      return;
    case 'database.delete':
      await tx
        .delete(database)
        .where(
          and(
            eq(database.branchId, change.branchId),
            eq(database.name, change.name),
          ),
        );
      return;
    case 'database.setDataApi':
      await tx
        .update(database)
        .set({
          dataApiEnabled: change.enabled,
          ...(change.index === undefined ? {} : { dataApiIndex: change.index }),
        })
        .where(
          and(
            eq(database.branchId, change.branchId),
            eq(database.name, change.name),
          ),
        );
      return;
    case 'branch.setAuthenticator':
      await tx
        .update(branch)
        .set({ authenticatorPasswordEnc: change.passwordEnc })
        .where(eq(branch.id, change.branchId));
      return;
    case 'project.setDataApiPlatformKey':
      await tx
        .update(neonProject)
        .set({
          dataApiJwks: change.jwks,
          dataApiSigningKeyEnc: change.signingKeyEnc,
        })
        .where(eq(neonProject.id, change.projectId));
      return;
    case 'project.setDataApiCustomJwks':
      await tx
        .update(neonProject)
        .set({ dataApiCustomJwks: change.jwks })
        .where(eq(neonProject.id, change.projectId));
      return;
    case 'libsql.insert':
      await tx.insert(libsqlDatabase).values(change.row);
      return;
    case 'libsql.markDeleted':
      await tx
        .update(libsqlDatabase)
        .set({ deletedAt: sql`now()`, state: 'deleting' })
        .where(eq(libsqlDatabase.id, change.id));
      return;
  }
}
