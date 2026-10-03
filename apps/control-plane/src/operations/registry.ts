import { registerDataApiSteps } from '../data-api/steps.js';
import type { DataApiStepDeps } from '../data-api/steps.js';
import { registerLibsqlSteps } from '../libsql/steps.js';
import type { LibsqlStepDeps } from '../libsql/steps.js';
import type { NeonStepDeps } from '../neon/steps/deps.js';
import { registerNeonSteps } from '../neon/steps/index.js';
import type { PlatformDeps } from '../platform/deps.js';
import { registerPlatformSteps } from '../platform/steps.js';
import { StepRegistry, noopStep } from './steps.js';

/** Everything the worker's steps close over. */
export interface StepDeps {
  neon: NeonStepDeps;
  libsql: LibsqlStepDeps;
  dataApi: DataApiStepDeps;
  platform: PlatformDeps;
}

/** The registry the worker runs: one plan per Neon, libSQL, Data API and platform action. */
export function createStepRegistry(deps: StepDeps): StepRegistry {
  const registry = registerNeonSteps(
    new StepRegistry().registerStep(noopStep),
    deps.neon,
  );
  registerLibsqlSteps(registry, deps.libsql);
  registerDataApiSteps(registry, deps.dataApi);
  return registerPlatformSteps(registry, deps.platform);
}
