import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

/**
 * Idempotent seeder for the first admin account.
 *
 * Reads INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD from environment variables.
 * Does not overwrite an existing account's password when run again.
 *
 * Usage:
 *   INITIAL_ADMIN_EMAIL=427rohit@gmail.com \
 *   INITIAL_ADMIN_PASSWORD=427rohit@ \
 *   npx tsx scripts/seed-admin.ts
 *
 * After initial setup, remove INITIAL_ADMIN_PASSWORD from deployment environments.
 */

async function main(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL
  const password = process.env.INITIAL_ADMIN_PASSWORD

  if (!email || !password) {
    console.error(
      'ERROR: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are required.'
    )
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('ERROR: INITIAL_ADMIN_PASSWORD must be at least 8 characters.')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  // Check if the admin already exists
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    const existingUser = existing.docs[0] as any
    console.log(
      `Admin account already exists: ${existingUser.email} (role: ${existingUser.role}). No changes made.`
    )
    process.exit(0)
  }

  // Create the first super_admin account. Payload hashes the password automatically.
  await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      role: 'super_admin',
      status: 'active',
    },
  })

  console.log(
    `First admin account created successfully: ${email} (role: super_admin).`
  )
  console.log(
    'IMPORTANT: Remove INITIAL_ADMIN_PASSWORD from your deployment environment after initial setup.'
  )
}

main().catch((err: unknown) => {
  console.error('Seeder failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})