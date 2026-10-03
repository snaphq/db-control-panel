import { createMemoryPlatformStore } from './store-memory.js';
import { describePlatformStoreContract } from './store.contract.js';

describePlatformStoreContract('memory', async () => {
  const store = createMemoryPlatformStore();
  return {
    store,
    async finish(operationId) {
      const record = store.operations.get(operationId);
      if (record) record.status = 'finished';
    },
  };
});
