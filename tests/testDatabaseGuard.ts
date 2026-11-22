/**
 * Hard stop so integration tests can never touch a remote / production / shared database.
 * Only a LOCAL Postgres whose database name ends in `_test` is accepted.
 */
export function assertSafeTestDatabase(url: string | undefined): void {
  if (!url) throw new Error('[test-guard] DATABASE_URL is not set. Create .env.test (see .env.test.example).')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('[test-guard] DATABASE_URL is not a valid URL.')
  }
  const host = parsed.hostname
  const db = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]']
  if (!localHosts.includes(host)) {
    throw new Error(`[test-guard] Refusing to run tests: database host "${host}" is not local.`)
  }
  if (!/_test$/.test(db)) {
    throw new Error(`[test-guard] Refusing to run tests: database "${db}" must end with "_test".`)
  }
}
