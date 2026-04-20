export default {
  test: {
    globalSetup: ['gitnexus/test/global-setup.ts'],
    include: ['gitnexus/test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    pool: 'forks',
    globals: true,
    setupFiles: ['gitnexus/test/setup.ts'],
    teardownTimeout: 3000,
    dangerouslyIgnoreUnhandledErrors: true,
    onUnhandledError(error) {
      const message = String(error?.message || '');
      if (message.includes('[vitest-pool]: Worker forks emitted error.')) {
        return false;
      }
    },
    coverage: {
      provider: 'v8',
      include: ['gitnexus/src/**/*.ts'],
      exclude: [
        'gitnexus/src/cli/index.ts',
        'gitnexus/src/server/**',
        'gitnexus/src/core/wiki/**',
      ],
      thresholds: {
        statements: 26,
        branches: 23,
        functions: 28,
        lines: 27,
        autoUpdate: true,
      },
    },
  },
};
