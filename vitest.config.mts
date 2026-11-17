import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { config as dotenvConfig } from 'dotenv'

// Load project environment variables (DATABASE_URL, PAYLOAD_SECRET, ...)
// so tests run against the same configuration as the dev server.
dotenvConfig()

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
