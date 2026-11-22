import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { config as dotenvConfig } from 'dotenv'
import { assertSafeTestDatabase } from './tests/testDatabaseGuard'

// Tests use ONLY .env.test (local docker postgres). The regular .env (remote database)
// is never loaded here; `override` makes sure an exported DATABASE_URL cannot leak in.
dotenvConfig({ path: '.env.test', override: true })
assertSafeTestDatabase(process.env.DATABASE_URL)

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 60000,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
