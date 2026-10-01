import { z } from 'zod';
import type { StepDefinition } from '../../operations/steps.js';
import { type NeonStepDeps, forEndpoint, readParams } from './deps.js';

const updateParams = z.object({
  /** Set when the compute size changed: pod resources cannot change in place. */
  restart: z.boolean().default(false),
});

export function endpointStartSteps(deps: NeonStepDeps): StepDefinition[] {
  return [
    {
      name: 'neon.endpoint.start.wake',
      async run({ operation }) {
        const woken = await forEndpoint(() =>
          deps.runtime.wake(operation.targetId),
        );
        return { podIp: woken.podIp, coldStart: woken.coldStart };
      },
    },
  ];
}

export function endpointSuspendSteps(deps: NeonStepDeps): StepDefinition[] {
  return [
    {
      name: 'neon.endpoint.suspend.suspend',
      async run({ operation }) {
        // Also the cleanup step of an endpoint delete: the API marked the row
        // deleted, and suspend still finds it.
        return { result: await deps.runtime.suspend(operation.targetId) };
      },
    },
  ];
}

/**
 * Applies an endpoint change. A new compute size needs a new pod, so the compute
 * is stopped in one step and started again in the next; the first step's output
 * is stored, so a retry of the second never skips the start.
 */
export function endpointUpdateSteps(deps: NeonStepDeps): StepDefinition[] {
  return [
    {
      name: 'neon.endpoint.update.stop',
      async run(context) {
        const { restart } = readParams(context, updateParams);
        if (!restart) return { stopped: false };
        const result = await deps.runtime.suspend(context.operation.targetId);
        return { stopped: result === 'suspended' };
      },
    },
    {
      name: 'neon.endpoint.update.apply',
      async run(context) {
        const id = context.operation.targetId;
        const stopped = (
          context.outputs['neon.endpoint.update.stop'] as {
            stopped?: boolean;
          } | null
        )?.stopped;
        if (stopped) {
          await forEndpoint(() => deps.runtime.wake(id));
          return { restarted: true };
        }
        // Same pod: push the new spec (for example the suspend timeout). An
        // idle endpoint picks the change up on its next start.
        return {
          reconfigured: await forEndpoint(() => deps.runtime.reconfigure(id)),
        };
      },
    },
  ];
}
