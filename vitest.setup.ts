// Any setup scripts you might need go here

// Load .env files
// Environment comes exclusively from .env.test (loaded in vitest.config.mts); never from .env.
import { assertSafeTestDatabase } from './tests/testDatabaseGuard'
assertSafeTestDatabase(process.env.DATABASE_URL)

// vitest's jsdom environment provides its own TextEncoder/TextDecoder whose
// Uint8Array instances are from a different realm than Node's. jose (used by
// Payload's JWT signing/verification) key-type checks fail against them, so
// force the Node implementations globally.
// vitest's jsdom environment provides its own TextEncoder/TextDecoder whose
// Uint8Array instances are from a different realm than Node's. jose (used by
// Payload's JWT authentication) key-type checks fail against them, so force
// the Node implementations globally. A dynamic import is used because Vite
// does not bundle Node built-ins in setup files.


// Self-seed: every integration suite logs in as this admin. Ensure it exists with the
// expected role/status/password so suites do not depend on whatever the local DB holds.
import { afterAll, beforeAll } from 'vitest'

const TEST_ADMIN_EMAIL = '427rohit@gmail.com'
const TEST_ADMIN_PASSWORD = '427rohit@'

beforeAll(async () => {
  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('@/payload.config')
  const payload = await getPayload({ config: payloadConfig })
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: TEST_ADMIN_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    email: TEST_ADMIN_EMAIL,
    password: TEST_ADMIN_PASSWORD,
    role: 'super_admin',
    status: 'active',
  } as any
  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
  } else {
    await payload.create({ collection: 'users', data, overrideAccess: true })
  }
})

// Tests create accounts/applications and trigger mail rows (marked as skipped in the test environment).
// Remove those rows so test runs never clutter the admin Mail tab.
afterAll(async () => {
  try {
    const { getPayload } = await import('payload')
    const { default: payloadConfig } = await import('@/payload.config')
    const payload = await getPayload({ config: payloadConfig })
    await payload.delete({ collection: 'payments', where: { receipt: { equals: 'vitest' } }, overrideAccess: true })
    await payload.delete({
      collection: 'email-logs',
      where: { error: { equals: 'Mail is disabled in the test environment.' } },
      overrideAccess: true,
    })
  } catch {
    /* cleanup is best effort */
  }
})
