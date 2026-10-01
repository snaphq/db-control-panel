import { createMemoryNeonStore } from '../neon/store-memory.js';
import { createMemoryLibsqlStore } from './store-memory.js';
import { describeLibsqlStoreContract } from './store.contract.js';

describeLibsqlStoreContract('memory', async () => {
  const neon = createMemoryNeonStore();
  return {
    neon,
    libsql: createMemoryLibsqlStore(neon),
    async finish(operationId) {
      const record = neon.operations.get(operationId);
      if (record) record.status = 'finished';
    },
  };
});
