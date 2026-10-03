import type { StepRegistry } from '../operations/steps.js';
import type { PlatformDeps } from './deps.js';
import { rebalanceSteps } from './rebalance-steps.js';
import { spreadSteps } from './spread-steps.js';

/** Registers the plans of the platform-wide operations. */
export function registerPlatformSteps(
  registry: StepRegistry,
  deps: PlatformDeps,
): StepRegistry {
  const plans = [
    ['safekeepers.spread', spreadSteps(deps)],
    ['pageservers.rebalance', rebalanceSteps(deps)],
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
