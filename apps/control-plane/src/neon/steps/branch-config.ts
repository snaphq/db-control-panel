import { z } from 'zod';
import type { StepDefinition } from '../../operations/steps.js';
import { type NeonStepDeps, forEndpoint, gone, readParams } from './deps.js';

/**
 * Role and database changes. The desired state (role rows, database rows) is
 * written by the API; compute_ctl turns it into SQL, because every spec it
 * applies creates missing roles and databases, alters a role whose SCRAM secret
 * differs, and drops databases named in `delta_operations`
 * (compute_tools/src/spec_apply.rs:845-880, 1021-1077). That keeps one source of
 * truth, needs no SQL or superuser connection from the control plane, and means
 * a compute that is not running picks the change up on its next start.
 */

const branchParams = z.object({ branchId: z.string() });
const dropParams = z.object({ branchId: z.string(), name: z.string() });

/** Pushes the current spec to every running compute of a branch. */
async function reconfigureBranch(deps: NeonStepDeps, branchId: string) {
  const endpoints = await deps.store.listBranchEndpoints(branchId);
  let applied = 0;
  for (const endpoint of endpoints) {
    if (await forEndpoint(() => deps.runtime.reconfigure(endpoint.id)))
      applied += 1;
  }
  return { applied };
}

function applyStep(name: string, deps: NeonStepDeps): StepDefinition {
  return {
    name,
    async run(context) {
      const { branchId } = readParams(context, branchParams);
      return reconfigureBranch(deps, branchId);
    },
  };
}

/** `role.reset_password` also serves role creation: both write a role row and push the spec. */
export const roleApplySteps = (deps: NeonStepDeps) => [
  applyStep('neon.role.apply', deps),
];
export const databaseCreateSteps = (deps: NeonStepDeps) => [
  applyStep('neon.database.create.apply', deps),
];

export function databaseDeleteSteps(deps: NeonStepDeps): StepDefinition[] {
  return [
    {
      name: 'neon.database.delete.drop',
      async run(context) {
        const { branchId, name } = readParams(context, dropParams);
        const branch = await deps.store.getBranch(branchId);
        if (!branch) throw gone('Branch', branchId);
        const writers = (await deps.store.listBranchEndpoints(branchId)).filter(
          (e) => e.type === 'read_write',
        );
        const primary = writers[0];
        if (!primary) {
          // The database stays in the timeline until a compute exists to drop it.
          return {
            dropped: false,
            reason: 'branch has no read_write endpoint',
          };
        }
        // The row is already gone, so the spec no longer lists the database; a
        // delete_db operation is what actually drops it. Starting the compute
        // first is what makes this work for an idle endpoint too.
        await forEndpoint(() => deps.runtime.wake(primary.id));
        await forEndpoint(() =>
          deps.runtime.reconfigure(primary.id, {
            deltaOperations: [{ action: 'delete_db', name, new_name: null }],
          }),
        );
        return { dropped: true, endpointId: primary.id };
      },
    },
  ];
}
