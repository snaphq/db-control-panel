import {
  NonRetryableError,
  type StepDefinition,
} from '../../operations/steps.js';
import { type NeonStepDeps, gone } from './deps.js';

/**
 * Flows from docs-internal/platform/control-plane.mdx. The API has already
 * written the project, default branch, endpoint, role and database rows; these
 * steps create the storage-side state to match and are safe to repeat.
 */

export function projectCreateSteps(deps: NeonStepDeps): StepDefinition[] {
  const { store, storcon } = deps;
  return [
    {
      name: 'neon.project.create.tenant',
      async run({ operation }) {
        const project = await store.getProject(operation.targetId);
        if (!project) throw gone('Project', operation.targetId);
        // Re-creating the same tenant id is a no-op in the controller.
        await storcon.createTenant({
          tenantId: project.tenantId,
          historyRetentionSeconds: project.historyRetentionSeconds,
        });
        return { tenantId: project.tenantId };
      },
    },
    {
      name: 'neon.project.create.timeline',
      async run({ operation }) {
        const project = await store.getProject(operation.targetId);
        if (!project) throw gone('Project', operation.targetId);
        const branch = (await store.listProjectBranches(project.id)).find(
          (b) => b.isDefault,
        );
        if (!branch) {
          throw new NonRetryableError(
            `Project ${project.id} has no default branch`,
          );
        }
        const created = await storcon.createTimeline(project.tenantId, {
          kind: 'root',
          timelineId: branch.timelineId,
          pgVersion: project.pgVersion,
        });
        // The controller answers with safekeepers because it runs with
        // --timelines-onto-safekeepers; without them no compute could start.
        if (
          !created.safekeepers ||
          created.safekeepers.safekeepers.length === 0
        ) {
          throw new Error(
            `The storage controller created timeline ${branch.timelineId} without safekeepers (is --timelines-onto-safekeepers set?)`,
          );
        }
        await store.updateBranchPlacement(branch.id, {
          safekeepers: {
            generation: created.safekeepers.generation,
            safekeepers: created.safekeepers.safekeepers,
          },
        });
        return {
          branchId: branch.id,
          generation: created.safekeepers.generation,
        };
      },
    },
  ];
}

export function projectDeleteSteps(deps: NeonStepDeps): StepDefinition[] {
  const { store, storcon, runtime } = deps;
  return [
    {
      name: 'neon.project.delete.computes',
      async run({ operation }) {
        // The API soft-deleted the rows already, so look at deleted ones too.
        const branches = await store.listProjectBranches(operation.targetId, {
          includeDeleted: true,
        });
        let stopped = 0;
        for (const branch of branches) {
          const endpoints = await store.listBranchEndpoints(branch.id, {
            includeDeleted: true,
          });
          for (const endpoint of endpoints) {
            if ((await runtime.suspend(endpoint.id)) === 'suspended')
              stopped += 1;
          }
        }
        return { stopped };
      },
    },
    {
      name: 'neon.project.delete.tenant',
      async run({ operation }) {
        const project = await store.getProject(operation.targetId, {
          includeDeleted: true,
        });
        if (!project) throw gone('Project', operation.targetId);
        // Removes every timeline, on the pageservers and the safekeepers.
        await storcon.deleteTenant(project.tenantId);
        return { tenantId: project.tenantId };
      },
    },
  ];
}
