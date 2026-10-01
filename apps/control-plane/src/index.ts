import { type Config, ConfigError, loadConfig } from './config.js';
import { startApi } from './modes/api.js';
import { startDataApiGateway } from './modes/data-api-gateway.js';
import { startNeonGlue } from './modes/neon-glue.js';
import type { RunningMode } from './modes/types.js';
import { startWorker } from './modes/worker.js';

const SHUTDOWN_DEADLINE_MS = 30_000;

function startMode(config: Config): Promise<RunningMode> {
  switch (config.mode) {
    case 'api':
      return startApi(config);
    case 'neon-glue':
      return startNeonGlue(config);
    case 'worker':
      return startWorker(config);
    case 'data-api-gateway':
      return startDataApiGateway(config);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const running = await startMode(config);

  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.info(`${signal} received, shutting down`);
    const deadline = setTimeout(() => {
      console.error('shutdown deadline exceeded, exiting');
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    deadline.unref();
    running.stop().then(
      () => process.exit(0),
      (error) => {
        console.error('shutdown failed:', error);
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    console.error(`control-plane: ${error.message}`);
  } else {
    console.error('control-plane failed to start:', error);
  }
  process.exit(1);
});
