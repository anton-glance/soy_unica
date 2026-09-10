import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // El Worker de pruebas es uno solo: los archivos que lo usan comparten
    // base de datos, así que corren en serie.
    fileParallelism: false,
  },
})
