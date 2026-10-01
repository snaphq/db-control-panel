import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Tests run on the contract's TypeScript source, so they need no prior build.
      '@repo/control-plane-contract': fileURLToPath(
        new URL(
          '../../packages/control-plane-contract/src/index.ts',
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
