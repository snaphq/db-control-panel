/** A started mode. `stop` must be safe to call once, from a signal handler. */
export interface RunningMode {
  stop(): Promise<void>;
}
