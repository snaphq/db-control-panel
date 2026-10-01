import {
  NonRetryableError,
  type StepDefinition,
} from '../../operations/steps.js';
import { type NeonStepDeps, gone } from './deps.js';

export function branchCreateSteps(deps: NeonStepDeps): StepDefinition[] {
  const { store, storcon } = deps;
  return [
    {
      name: 'neon.branch.create.timeline',
      async run({ operation }) {
        const branch = await store.getBranch(operation.targetId);
        if (!branch) throw gone('Branch', operation.targetId);
        if (!branch.parentBranchId) {
          throw new NonRetryableError(
            `Branch ${branch.id} has no parent to branch from`,
          );
        }
        const [parent, project] = await Promise.all([
          store.getBranch(branch.parentBranchId),
          store.getProject(branch.projectId),
        ]);
        if (!parent) throw gone('Parent branch', branch.parentBranchId);
        if (!project) throw gone('Project', branch.projectId);
        const created = await storcon.createTimeline(project.tenantId, {
          kind: 'branch',
          timelineId: branch.timelineId,
          ancestorTimelineId: parent.timelineId,
          ancestorStartLsn: branch.parentLsn ?? undefined,
        });
        if (
          !created.safekeepers ||
          created.safekeepers.safekeepers.length === 0
        ) {
          throw new Error(
            `The storage controller created timeline ${branch.timelineId} without safekeepers`,
          );
        }
        await store.updateBranchPlacement(branch.id, {
          safekeepers: {
            generation: created.safekeepers.generation,
            safekeepers: created.safekeepers.safekeepers,
          },
          // When the request named no LSN, record where the branch actually forked.
          parentLsn: created.ancestor_lsn ?? undefined,
        });
        return {
          timelineId: branch.timelineId,
          ancestorLsn: created.ancestor_lsn ?? null,
        };
      },
    },
  ];
}

export function branchDeleteSteps(deps: NeonStepDeps): StepDefinition[] {
  const { store, storcon, runtime } = deps;
  return [
    {
      name: 'neon.branch.delete.computes',
      async run({ operation }) {
        const endpoints = await store.listBranchEndpoints(operation.targetId, {
          includeDeleted: true,
        });
        let stopped = 0;
        for (const endpoint of endpoints) {
          if ((await runtime.suspend(endpoint.id)) === 'suspended')
            stopped += 1;
        }
        return { stopped };
      },
    },
    {
      name: 'neon.branch.delete.timeline',
      async run({ operation }) {
        const branch = await store.getBranch(operation.targetId, {
          includeDeleted: true,
        });
        if (!branch) throw gone('Branch', operation.targetId);
        const project = await store.getProject(branch.projectId, {
          includeDeleted: true,
        });
        if (!project) throw gone('Project', branch.projectId);
        await storcon.deleteTimeline(project.tenantId, branch.timelineId);
        return { timelineId: branch.timelineId };
      },
    },
  ];
}
