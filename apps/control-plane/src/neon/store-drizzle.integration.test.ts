import { afterAll, beforeAll, describe } from 'vitest';
import { createDatabase } from '../db/client.js';
import type { DatabaseHandle } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createOperationStore } from '../operations/store.js';
import { createDrizzleNeonStore } from './store-drizzle.js';
import { describeNeonStoreContract } from './store.contract.js';

/** Needs CONTROL_PLANE_TEST_DATABASE_URL, like the other integration suites. */
const url = process.env.CONTROL_PLANE_TEST_DATABASE_URL;

let handle: DatabaseHandle;

describeNeonStoreContract(
  'PostgreSQL',
  async () => {
    const operations = createOperationStore(handle.db);
    return {
      store: createDrizzleNeonStore(handle.db, { enqueue: async () => {} }),
      finish: (operationId) => operations.markFinished(operationId),
    };
  },
  ((name: string, fn: () => void) =>
    describe.skipIf(!url)(name, () => {
      beforeAll(async () => {
        handle = createDatabase(url as string, { max: 6 });
        await runMigrations(handle, { info: () => {} });
      });
      afterAll(async () => {
        await handle.close();
      });
      fn();
    })) as typeof describe,
);
