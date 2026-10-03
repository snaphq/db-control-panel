import { sql } from 'drizzle-orm';
import { PgBoss, fromDrizzle } from 'pg-boss';
import type { Transaction } from '../db/client.js';
import { runOperation } from './runner.js';
import type { StepRegistry } from './steps.js';
import type { OperationStore } from './store.js';

const OPERATIONS_QUEUE = 'operations';

/** Failed attempts after the first; the job is then dead and the operation `failed`. */
const OPERATION_RETRY_LIMIT = 8;

interface OperationJob {
  operationId: string;
}

/** Hands an operation to the queue inside the transaction that created it. */
export interface OperationQueue {
  enqueue(
    operationId: string,
    tx: Transaction,
    options?: EnqueueOptions,
  ): Promise<void>;
}

interface EnqueueOptions {
  /**
   * How long one attempt may run before the queue presumes the worker dead and
   * retries it. The queue default is 15 minutes; a platform operation that
   * moves many timelines needs longer.
   */
  expireInSeconds?: number;
}

export type Role = 'producer' | 'worker';

/** pg-boss keeps its tables in the `pgboss` schema of the control_plane database. */
export function createBoss(connectionString: string, role: Role): PgBoss {
  const boss = new PgBoss({
    connectionString,
    application_name: `control-plane-${role}`,
    // Producers (the API) only insert jobs; maintenance and cron belong to the worker.
    supervise: role === 'worker',
    schedule: role === 'worker',
    max: role === 'worker' ? 10 : 4,
  });
  boss.on('error', (error) => {
    console.error('pg-boss error:', error);
  });
  return boss;
}

/** Starts pg-boss and makes sure the operations queue exists (idempotent). */
export async function startQueue(boss: PgBoss): Promise<void> {
  await boss.start();
  await boss.createQueue(OPERATIONS_QUEUE, {
    retryLimit: OPERATION_RETRY_LIMIT,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 300,
    expireInSeconds: 15 * 60,
  });
}

export function createOperationQueue(boss: PgBoss): OperationQueue {
  return {
    async enqueue(operationId, tx, options) {
      const job: OperationJob = { operationId };
      const jobId = await boss.send(OPERATIONS_QUEUE, job, {
        db: fromDrizzle(tx, sql),
        ...(options?.expireInSeconds === undefined
          ? {}
          : { expireInSeconds: options.expireInSeconds }),
        // One live job per operation, even if enqueue is called twice.
        singletonKey: operationId,
      });
      if (jobId === null) {
        throw new Error(`Could not enqueue operation ${operationId}`);
      }
    },
  };
}

export interface OperationWorkerOptions {
  store: OperationStore;
  registry: StepRegistry;
  concurrency?: number;
}

export async function startOperationWorker(
  boss: PgBoss,
  options: OperationWorkerOptions,
): Promise<string> {
  return boss.work<OperationJob>(
    OPERATIONS_QUEUE,
    { batchSize: 1, localConcurrency: options.concurrency ?? 4 },
    async (jobs) => {
      for (const job of jobs) {
        await runOperation(job.data.operationId, {
          store: options.store,
          registry: options.registry,
          isFinalAttempt: job.retryCount >= OPERATION_RETRY_LIMIT,
        });
      }
    },
  );
}
