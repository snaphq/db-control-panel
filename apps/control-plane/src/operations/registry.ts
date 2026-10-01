import { registerLibsqlSteps } from '../libsql/steps.js';
import type { LibsqlStepDeps } from '../libsql/steps.js';
import type { NeonStepDeps } from '../neon/steps/deps.js';
import { registerNeonSteps } from '../neon/steps/index.js';
import { StepRegistry, noopStep } from './steps.js';

/** Everything the worker's steps close over. The Data API steps join in later work. */
export interface StepDeps {
  neon: NeonStepDeps;
  libsql: LibsqlStepDeps;
}

/** The registry the worker runs: one plan per Neon and libSQL action. */
export function createStepRegistry(deps: StepDeps): StepRegistry {
  const registry = registerNeonSteps(
    new StepRegistry().registerStep(noopStep),
    deps.neon,
  );
  return registerLibsqlSteps(registry, deps.libsql);
}
