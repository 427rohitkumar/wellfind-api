import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { GET as meGET } from '@/app/api/auth/me/route'
import { GET as unreadGET } from '@/app/api/notifications/unread-count/route'
import { POST as registerPOST } from '@/app/api/notifications/devices/register/route'
import { DELETE as deviceDELETE } from '@/app/api/notifications/devices/[id]/route'

const PASSWORD = 'LogoutSpec123!'
const EMAIL = 'logout-spec-user@example.com'
const OTHER_EMAIL = 'logout-spec-other@example.com'
let payload: any

const req = (path: string, token?: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

const login = async (email = EMAIL): Promise<string> =>
  (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token

const logout = async (token?: string) => {
  const res = await logoutPOST(req('/api/auth/logout', token, 'POST'))
  return { status: res.status, body: (await res.json()) as any }
}

const meStatus = async (token: string) => (await meGET(req('/api/auth/me', token))).status

const removeUsers = () =>
  payload.delete({ collection: 'users', where: { email: { in: [EMAIL, OTHER_EMAIL] } }, overrideAccess: true })

describe('POST /api/auth/logout', { timeout: 120000 }, () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await removeUsers() // leftovers from an interrupted earlier run
    for (const email of [EMAIL, OTHER_EMAIL]) {
      await payload.create({
        collection: 'users',
        data: { email, password: PASSWORD, role: 'teacher', status: 'active' },
        overrideAccess: true,
      })
    }
  })

  afterAll(async () => {
    await removeUsers().catch(() => undefined)
  })

  it('rejects the old token afterwards and keeps other sessions signed in, without logging errors', async () => {
    const first = await login()
    const second = await login()
    const otherUser = await login(OTHER_EMAIL)
    expect(await meStatus(first)).toBe(200)
    expect(await meStatus(second)).toBe(200)

    const logged = vi.spyOn(payload.logger, 'error')
    const consoled = vi.spyOn(console, 'error')
    try {
      expect(await logout(first)).toEqual({ status: 200, body: { message: 'Logged out successfully.' } })
      expect(logged).not.toHaveBeenCalled()
      expect(consoled).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
      consoled.mockRestore()
    }

    expect(await meStatus(first)).toBe(401)
    expect((await unreadGET(req('/api/notifications/unread-count', first))).status).toBe(401)
    expect(await meStatus(second)).toBe(200)
    expect(await meStatus(otherUser)).toBe(200)
    // A new login after logout works as usual.
    expect(await meStatus(await login())).toBe(200)
  })

  it('answers 200 and ends no session for a repeated, missing or invalid token', async () => {
    const ended = await login()
    const kept = await login()
    await logout(ended)

    for (const token of [ended, undefined, 'not-a-token']) {
      expect(await logout(token)).toEqual({ status: 200, body: { message: 'Logged out successfully.' } })
    }
    expect(await meStatus(kept)).toBe(200)
  })

  it('ends the session of an account that was suspended after signing in', async () => {
    const token = await login(OTHER_EMAIL)
    const setStatus = (status: string) =>
      payload.update({ collection: 'users', where: { email: { equals: OTHER_EMAIL } }, data: { status }, overrideAccess: true })

    await setStatus('suspended')
    expect((await logout(token)).status).toBe(200)
    await setStatus('active')
    expect(await meStatus(token)).toBe(401)
  })

  // Clients have to unregister the push device first: a logged-out token cannot do it any more.
  it('does not let the logged-out token unregister a push device', async () => {
    const token = await login()
    const other = await login()
    const registered = await registerPOST(
      req('/api/notifications/devices/register', token, 'POST', {
        fcmToken: 'fcm-spec-logout-' + 'x'.repeat(40),
        platform: 'android',
        environment: 'development',
      }),
    )
    const { data } = (await registered.json()) as any
    await logout(token)

    const remove = (t: string) =>
      deviceDELETE(req(`/api/notifications/devices/${data.id}`, t, 'DELETE'), {
        params: Promise.resolve({ id: String(data.id) }),
      })
    expect((await remove(token)).status).toBe(401)
    expect((await remove(other)).status).toBe(200)
  })
})
