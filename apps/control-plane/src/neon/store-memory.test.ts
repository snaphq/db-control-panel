import { createMemoryNeonStore } from './store-memory.js';
import { describeNeonStoreContract } from './store.contract.js';

describeNeonStoreContract('memory', async () => {
  const store = createMemoryNeonStore();
  return {
    store,
    async finish(operationId) {
      const record = store.operations.get(operationId);
      if (record) record.status = 'finished';
    },
  };
});
