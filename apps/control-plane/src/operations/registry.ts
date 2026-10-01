import type { NeonStepDeps } from '../neon/steps/deps.js';
import { registerNeonSteps } from '../neon/steps/index.js';
import { StepRegistry, noopStep } from './steps.js';

/** Everything the worker's steps close over. The libSQL and Data API steps join in later work. */
export interface StepDeps {
  neon: NeonStepDeps;
}

/** The registry the worker runs: one plan per Neon action. */
export function createStepRegistry(deps: StepDeps): StepRegistry {
  return registerNeonSteps(
    new StepRegistry().registerStep(noopStep),
    deps.neon,
  );
}
