/** A background job that runs every `intervalMs` until stopped; errors are logged, never fatal. */
export interface Loop {
  stop(): Promise<void>;
}

export function startLoop(
  name: string,
  intervalMs: number,
  task: () => Promise<unknown>,
  logger: {
    info(message: string): void;
    error(message: string): void;
  } = console,
): Loop {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = () => {
    if (stopped) return;
    running = task().then(
      () => undefined,
      (error) => {
        logger.error(
          `${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
    running.finally(() => {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
        timer.unref();
      }
    });
  };
  tick();
  logger.info(`${name} runs every ${Math.round(intervalMs / 1000)}s`);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
