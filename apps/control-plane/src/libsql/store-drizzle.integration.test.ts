import { afterAll, beforeAll, describe } from 'vitest';
import { createDatabase } from '../db/client.js';
import type { DatabaseHandle } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createDrizzleNeonStore } from '../neon/store-drizzle.js';
import { createOperationStore } from '../operations/store.js';
import { createDrizzleLibsqlStore } from './store-drizzle.js';
import { describeLibsqlStoreContract } from './store.contract.js';

/** Needs CONTROL_PLANE_TEST_DATABASE_URL, like the other integration suites. */
const url = process.env.CONTROL_PLANE_TEST_DATABASE_URL;

let handle: DatabaseHandle;

describeLibsqlStoreContract(
  'PostgreSQL',
  async () => {
    const queue = { enqueue: async () => {} };
    const operations = createOperationStore(handle.db);
    return {
      neon: createDrizzleNeonStore(handle.db, queue),
      libsql: createDrizzleLibsqlStore(handle.db, queue),
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
