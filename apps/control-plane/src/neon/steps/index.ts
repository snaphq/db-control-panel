import type { StepRegistry } from '../../operations/steps.js';
import {
  databaseCreateSteps,
  databaseDeleteSteps,
  roleApplySteps,
} from './branch-config.js';
import { branchCreateSteps, branchDeleteSteps } from './branch.js';
import type { NeonStepDeps } from './deps.js';
import {
  endpointStartSteps,
  endpointSuspendSteps,
  endpointUpdateSteps,
} from './endpoint.js';
import { projectCreateSteps, projectDeleteSteps } from './project.js';

/** Registers the plan of every Neon operation action. */
export function registerNeonSteps(
  registry: StepRegistry,
  deps: NeonStepDeps,
): StepRegistry {
  const plans = [
    ['project.create', projectCreateSteps(deps)],
    ['project.delete', projectDeleteSteps(deps)],
    ['branch.create', branchCreateSteps(deps)],
    ['branch.delete', branchDeleteSteps(deps)],
    ['endpoint.start', endpointStartSteps(deps)],
    ['endpoint.suspend', endpointSuspendSteps(deps)],
    ['endpoint.update', endpointUpdateSteps(deps)],
    ['role.reset_password', roleApplySteps(deps)],
    ['database.create', databaseCreateSteps(deps)],
    ['database.delete', databaseDeleteSteps(deps)],
  ] as const;
  for (const [action, steps] of plans) {
    for (const step of steps) registry.registerStep(step);
    registry.registerPlan(
      action,
      steps.map((s) => s.name),
    );
  }
  return registry;
}
