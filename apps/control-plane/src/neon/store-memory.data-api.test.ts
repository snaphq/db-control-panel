import { createMemoryNeonStore } from './store-memory.js';
import { describeDataApiStoreContract } from './store.data-api.contract.js';

describeDataApiStoreContract('memory', async () => {
  const store = createMemoryNeonStore();
  return {
    store,
    async finish(operationId) {
      const record = store.operations.get(operationId);
      if (record) record.status = 'finished';
    },
  };
});
