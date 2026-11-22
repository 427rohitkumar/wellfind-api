import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { fcm } = vi.hoisted(() => ({
  fcm: {
    sent: [] as { token: string; title: string; body: string; data: Record<string, string> }[],
    configured: true,
    // token substring -> result override
    behaviour: new Map<string, () => unknown>(),
  },
}))
vi.mock('@/lib/firebaseAdmin', () => ({
  isFcmConfigured: () => fcm.configured,
  sendFcmMessage: async (m: { token: string; title: string; body: string; data: Record<string, string> }) => {
    for (const [key, fn] of fcm.behaviour) if (m.token.includes(key)) return fn()
    fcm.sent.push(m)
    return { ok: true, messageId: `msg-${fcm.sent.length}` }
  },
}))

import { getPayload } from 'payload'
import config from '@/payload.config'
import { DELETE as clearAllDELETE, GET as listGET } from '@/app/api/notifications/route'
import { GET as unreadGET } from '@/app/api/notifications/unread-count/route'
import { PATCH as readAllPATCH } from '@/app/api/notifications/read-all/route'
import { PATCH as readPATCH } from '@/app/api/notifications/[id]/read/route'
import { DELETE as deleteNotification } from '@/app/api/notifications/[id]/route'
import { POST as registerPOST } from '@/app/api/notifications/devices/register/route'
import { DELETE as deviceDELETE } from '@/app/api/notifications/devices/[id]/route'
import { notifyStaff, notifyUsers } from '@/services/notificationService'
import { pushNewStudentEnquiry, pushRegistrationPaid } from '@/services/pushEvents'

const PASSWORD = 'MobileNotifSpec123!'
const ROLES = ['teacher', 'teacher2', 'student_counselor', 'finance_manager', 'super_admin'] as const
const email = (r: string) => `mobnotif-${r}@example.com`
const token = (name: string) => `fcm-spec-${name}-` + 'x'.repeat(40)
let payload: any
const tok: Record<string, string> = {}
const uid: Record<string, number> = {}

const R = (who: string, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost:3000${path}`, { method, headers: { Authorization: `Bearer ${tok[who]}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })
const j = async (r: Response) => ({ s: r.status, b: (await r.json()) as any })
const device = (name: string, extra: Record<string, unknown> = {}) => ({ fcmToken: token(name), platform: 'android', environment: 'development', ...extra })

describe('mobile notifications', { timeout: 120000 }, () => {
  beforeAll(async () => {
    process.env.NOTIFICATION_ENV = 'development'
    payload = await getPayload({ config: await config })
    // leftovers from an interrupted earlier run
    const stale = await payload.find({ collection: 'users', where: { email: { contains: 'mobnotif-' } }, limit: 50, depth: 0, overrideAccess: true })
    const staleIds = stale.docs.map((d: any) => d.id)
    if (staleIds.length) {
      const old = await payload.find({ collection: 'notifications', where: { user: { in: staleIds } }, limit: 1000, depth: 0, overrideAccess: true })
      if (old.docs.length) await payload.delete({ collection: 'notification-deliveries', where: { notification: { in: old.docs.map((d: any) => d.id) } }, overrideAccess: true })
      await payload.delete({ collection: 'notifications', where: { user: { in: staleIds } }, overrideAccess: true })
      await payload.delete({ collection: 'user-devices', where: { user: { in: staleIds } }, overrideAccess: true })
      await payload.delete({ collection: 'users', where: { id: { in: staleIds } }, overrideAccess: true })
    }
    for (const r of ROLES) {
      const u = await payload.create({ collection: 'users', data: { email: email(r), password: PASSWORD, role: r === 'teacher2' ? 'teacher' : r, status: 'active' }, overrideAccess: true })
      uid[r] = u.id
      tok[r] = (await payload.login({ collection: 'users', data: { email: email(r), password: PASSWORD } })).token
    }
  })
  beforeEach(() => {
    fcm.sent.length = 0
    fcm.behaviour.clear()
    fcm.configured = true
  })
  afterAll(async () => {
    const ids = Object.values(uid)
    const mine = await payload.find({ collection: 'notifications', where: { user: { in: ids } }, limit: 1000, depth: 0, overrideAccess: true })
    const nIds = mine.docs.map((d: any) => d.id)
    if (nIds.length) await payload.delete({ collection: 'notification-deliveries', where: { notification: { in: nIds } }, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'notifications', where: { user: { in: ids } }, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'user-devices', where: { user: { in: ids } }, overrideAccess: true }).catch(() => undefined)
    for (const r of ROLES) await payload.delete({ collection: 'users', id: uid[r], overrideAccess: true }).catch(() => undefined)
  })

  describe('device registration', () => {
    it('requires authentication', async () => {
      const r = await registerPOST(new Request('http://localhost:3000/x', { method: 'POST', body: JSON.stringify(device('anon')) }))
      expect(r.status).toBe(401)
    })

    it('registers a device for the signed-in user, ignoring any client supplied user id', async () => {
      const { s, b } = await j(await registerPOST(R('teacher', '', 'POST', { ...device('t1'), user: uid.teacher2, appVersion: '1.0.0' })))
      expect(s).toBe(201)
      const row = await payload.findByID({ collection: 'user-devices', id: b.data.id, depth: 0, overrideAccess: true })
      expect(row.user).toBe(uid.teacher)
      expect(row.environment).toBe('development')
      expect(row.active).toBe(true)
      expect(JSON.stringify(b)).not.toContain(token('t1'))
    })

    it('does not duplicate a token, and moves it to the user who signed in on that phone', async () => {
      const first = await j(await registerPOST(R('teacher', '', 'POST', device('shared'))))
      const second = await j(await registerPOST(R('teacher2', '', 'POST', device('shared'))))
      expect(second.b.data.id).toBe(first.b.data.id)
      const rows = await payload.find({ collection: 'user-devices', where: { fcmToken: { equals: token('shared') } }, depth: 0, overrideAccess: true })
      expect(rows.totalDocs).toBe(1)
      expect(rows.docs[0].user).toBe(uid.teacher2)
    })

    it('supports several devices for one user', async () => {
      await registerPOST(R('teacher', '', 'POST', device('multi1')))
      await registerPOST(R('teacher', '', 'POST', device('multi2')))
      const rows = await payload.find({ collection: 'user-devices', where: { and: [{ user: { equals: uid.teacher } }, { fcmToken: { contains: 'multi' } }] }, overrideAccess: true })
      expect(rows.totalDocs).toBe(2)
    })

    it('validates the body and rejects an environment that is not this backend env', async () => {
      expect((await registerPOST(R('teacher', '', 'POST', { ...device('bad'), fcmToken: 'short' }))).status).toBe(400)
      expect((await registerPOST(R('teacher', '', 'POST', { ...device('bad'), platform: 'web' }))).status).toBe(400)
      expect((await registerPOST(R('teacher', '', 'POST', { ...device('bad'), environment: 'staging' }))).status).toBe(400)
      expect((await registerPOST(R('teacher', '', 'POST', { ...device('prodphone'), environment: 'production' }))).status).toBe(409)
    })

    it('unregisters only the caller own device', async () => {
      const { b } = await j(await registerPOST(R('teacher', '', 'POST', device('logout'))))
      expect((await deviceDELETE(R('teacher2', '', 'DELETE'), ctx(b.data.id))).status).toBe(404)
      expect((await deviceDELETE(R('teacher', '', 'DELETE'), ctx(b.data.id))).status).toBe(200)
      expect((await deviceDELETE(R('teacher', '', 'DELETE'), ctx(b.data.id))).status).toBe(404)
      expect((await deviceDELETE(R('teacher', '', 'DELETE'), ctx('abc'))).status).toBe(400)
    })
  })

  describe('delivery', () => {
    it('saves the notification first, sends only to the user devices, and logs the delivery', async () => {
      await registerPOST(R('teacher', '', 'POST', device('deliver')))
      await registerPOST(R('teacher2', '', 'POST', device('other')))
      await notifyUsers(payload, [uid.teacher], { type: 'allocation_created', title: 'New student allocated', body: 'Asha · Maths', entityType: 'allocation', entityId: 7, screen: '/teacher-student/7', dedupeKey: 'spec:deliver' })
      const tokens = fcm.sent.map((m) => m.token)
      expect(tokens).toContain(token('deliver'))
      expect(tokens).not.toContain(token('other'))
      const msg = fcm.sent.find((m) => m.token === token('deliver'))!
      expect(msg.data).toMatchObject({ type: 'allocation_created', entityType: 'allocation', entityId: '7', screen: '/teacher-student/7' })
      const n = await payload.find({ collection: 'notifications', where: { dedupeKey: { equals: `${uid.teacher}:spec:deliver` } }, overrideAccess: true })
      expect(n.totalDocs).toBe(1)
      const log = await payload.find({ collection: 'notification-deliveries', where: { notification: { equals: n.docs[0].id } }, overrideAccess: true })
      expect(log.docs.map((d: any) => d.status)).toContain('sent')
    })

    it('is idempotent: the same business event never notifies a user twice', async () => {
      const input = { type: 'payment_confirmed', title: 'Payment received', body: '₹1,000', dedupeKey: 'spec:payment-1' }
      await notifyUsers(payload, [uid.teacher], input)
      await notifyUsers(payload, [uid.teacher], input)
      await Promise.all([notifyUsers(payload, [uid.teacher], input), notifyUsers(payload, [uid.teacher], input)])
      const n = await payload.find({ collection: 'notifications', where: { dedupeKey: { equals: `${uid.teacher}:spec:payment-1` } }, overrideAccess: true })
      expect(n.totalDocs).toBe(1)
    })

    it('keeps the in-app notification when FCM is down or not configured', async () => {
      await registerPOST(R('teacher', '', 'POST', device('fcmdown')))
      fcm.behaviour.set('fcmdown', () => ({ ok: false, code: 'messaging/third-party-auth-error', invalidToken: false, transient: false }))
      await notifyUsers(payload, [uid.teacher], { type: 't', title: 'FCM down', body: 'b', dedupeKey: 'spec:fcm-down' })
      fcm.configured = false
      await notifyUsers(payload, [uid.teacher], { type: 't', title: 'FCM off', body: 'b', dedupeKey: 'spec:fcm-off' })
      const rows = await payload.find({ collection: 'notifications', where: { dedupeKey: { in: [`${uid.teacher}:spec:fcm-down`, `${uid.teacher}:spec:fcm-off`] } }, overrideAccess: true })
      expect(rows.totalDocs).toBe(2)
      const failed = await payload.find({ collection: 'notification-deliveries', where: { and: [{ status: { equals: 'failed' } }, { errorCode: { equals: 'messaging/third-party-auth-error' } }] }, overrideAccess: true })
      expect(failed.totalDocs).toBeGreaterThan(0)
    })

    it('retries transient FCM errors a few times', async () => {
      await registerPOST(R('teacher', '', 'POST', device('flaky')))
      let calls = 0
      fcm.behaviour.set('flaky', () => (++calls < 2 ? { ok: false, code: 'messaging/server-unavailable', invalidToken: false, transient: true } : { ok: true, messageId: 'm' }))
      await notifyUsers(payload, [uid.teacher], { type: 't', title: 'Flaky', body: 'b', dedupeKey: 'spec:flaky' })
      expect(calls).toBe(2)
    })

    it('deactivates tokens FCM reports as invalid', async () => {
      const { b } = await j(await registerPOST(R('teacher', '', 'POST', device('dead'))))
      fcm.behaviour.set('dead', () => ({ ok: false, code: 'messaging/registration-token-not-registered', invalidToken: true, transient: false }))
      await notifyUsers(payload, [uid.teacher], { type: 't', title: 'Dead', body: 'b', dedupeKey: 'spec:dead' })
      const row = await payload.findByID({ collection: 'user-devices', id: b.data.id, depth: 0, overrideAccess: true })
      expect(row.active).toBe(false)
      fcm.behaviour.clear()
      await notifyUsers(payload, [uid.teacher], { type: 't', title: 'Again', body: 'b', dedupeKey: 'spec:dead-2' })
      expect(fcm.sent.map((m) => m.token)).not.toContain(token('dead'))
    })

    it('never notifies devices of another environment', async () => {
      const row = await payload.create({ collection: 'user-devices', data: { user: uid.teacher, fcmToken: token('prodonly'), platform: 'android', environment: 'production', active: true }, overrideAccess: true })
      await notifyUsers(payload, [uid.teacher], { type: 't', title: 'Env', body: 'b', dedupeKey: 'spec:env' })
      expect(fcm.sent.map((m) => m.token)).not.toContain(token('prodonly'))
      await payload.delete({ collection: 'user-devices', id: row.id, overrideAccess: true })
    })
  })

  describe('recipient resolution and events', () => {
    it('admin events reach only staff whose role can read that module', async () => {
      await Promise.all(['student_counselor', 'finance_manager', 'super_admin', 'teacher'].map((r) => registerPOST(R(r, '', 'POST', device(`role-${r}`)))))
      await notifyStaff(payload, 'student_inquiries', { type: 't', title: 'Staff', body: 'b', dedupeKey: 'spec:staff-inq' })
      const tokens = fcm.sent.map((m) => m.token)
      expect(tokens).toContain(token('role-student_counselor'))
      expect(tokens).toContain(token('role-super_admin'))
      expect(tokens).not.toContain(token('role-finance_manager'))
      expect(tokens).not.toContain(token('role-teacher'))
    })

    it('a blocked staff account is not notified', async () => {
      await payload.update({ collection: 'users', id: uid.finance_manager, data: { status: 'blocked' }, overrideAccess: true, context: { skipAccountMail: true } })
      await notifyStaff(payload, 'payments', { type: 't', title: 'Pay', body: 'b', dedupeKey: 'spec:staff-blocked' })
      expect(fcm.sent.map((m) => m.token)).not.toContain(token('role-finance_manager'))
      await payload.update({ collection: 'users', id: uid.finance_manager, data: { status: 'active' }, overrideAccess: true, context: { skipAccountMail: true } })
    })

    it('a new student enquiry notifies the right staff with real ids, once', async () => {
      pushNewStudentEnquiry(payload, { id: 987001, name: 'Spec Student', studentClass: 'Class 5', locality: 'Boring Road' })
      pushNewStudentEnquiry(payload, { id: 987001, name: 'Spec Student', studentClass: 'Class 5', locality: 'Boring Road' })
      await new Promise((r) => setTimeout(r, 2500))
      const msgs = fcm.sent.filter((m) => m.data.entityId === '987001')
      for (const t of [token('role-student_counselor'), token('role-super_admin')]) expect(msgs.filter((m) => m.token === t)).toHaveLength(1)
      expect(msgs.map((m) => m.token)).not.toContain(token('role-finance_manager'))
      expect(msgs[0]!.data).toMatchObject({ type: 'student_inquiry_created', entityType: 'student_enquiry', screen: '/admin/enquiry/987001' })
    })

    it('a registration payment tells finance and the teacher once, with the real amount', async () => {
      const enquiry = { id: 987002, fullName: 'Spec Teacher', teacherUser: uid.teacher, registrationFee: { amount: 1500, transactionRef: 'pay_spec_1', status: 'paid' } }
      pushRegistrationPaid(payload, enquiry)
      pushRegistrationPaid(payload, enquiry)
      await new Promise((r) => setTimeout(r, 2500))
      const teacherMsgs = fcm.sent.filter((m) => m.data.entityId === '987002' && m.token === token('role-teacher'))
      expect(teacherMsgs).toHaveLength(1)
      expect(teacherMsgs[0]!.body).toContain('₹1,500')
      expect(fcm.sent.filter((m) => m.token === token('role-finance_manager') && m.data.entityId === '987002')).toHaveLength(1)
      expect(fcm.sent.filter((m) => m.token === token('role-student_counselor') && m.data.entityId === '987002')).toHaveLength(0)
    })
  })

  describe('account deletion', () => {
    it('still works for a user who has notifications, devices and delivery logs', async () => {
      const u = await payload.create({ collection: 'users', data: { email: email('todelete'), password: PASSWORD, role: 'teacher', status: 'active' }, overrideAccess: true })
      const d = await payload.create({ collection: 'user-devices', data: { user: u.id, fcmToken: token('todelete'), platform: 'android', environment: 'development' }, overrideAccess: true })
      await notifyUsers(payload, [u.id], { type: 't', title: 'Bye', body: 'b', dedupeKey: 'spec:delete' })
      await payload.delete({ collection: 'users', id: u.id, overrideAccess: true })
      expect((await payload.find({ collection: 'notifications', where: { user: { equals: u.id } }, overrideAccess: true })).totalDocs).toBe(0)
      expect((await payload.find({ collection: 'user-devices', where: { id: { equals: d.id } }, overrideAccess: true })).totalDocs).toBe(0)
      expect((await payload.find({ collection: 'notification-deliveries', where: { device: { equals: d.id } }, overrideAccess: true })).totalDocs).toBe(0)
    })
  })

  describe('notification center API', () => {
    const mine: number[] = []
    beforeAll(async () => {
      for (let i = 1; i <= 3; i++) {
        const n = await payload.create({ collection: 'notifications', data: { user: uid.teacher2, type: 'spec_list', title: `List ${i}`, body: 'b' }, overrideAccess: true })
        mine.push(n.id)
      }
    })

    it('is user scoped, paginated and newest first', async () => {
      const page1 = await j(await listGET(R('teacher2', '/api/notifications?limit=2&page=1')))
      expect(page1.s).toBe(200)
      expect(page1.b.data.notifications).toHaveLength(2)
      expect(page1.b.data.hasNextPage).toBe(true)
      const dates = page1.b.data.notifications.map((n: any) => n.createdAt)
      expect([...dates].sort().reverse()).toEqual(dates)
      const other = await j(await listGET(R('teacher', '/api/notifications?limit=50')))
      const otherIds: number[] = other.b.data.notifications.map((n: any) => n.id)
      expect(mine.some((id) => otherIds.includes(id))).toBe(false)
      expect((await listGET(new Request('http://localhost:3000/api/notifications'))).status).toBe(401)
    })

    it('tracks unread, marks one read (own only), then all read, and deletes (own only)', async () => {
      const before = (await j(await unreadGET(R('teacher2', '')))).b.data.count
      expect(before).toBeGreaterThanOrEqual(3)
      expect((await readPATCH(R('teacher', '', 'PATCH'), ctx(mine[0]!))).status).toBe(404)
      const read = await j(await readPATCH(R('teacher2', '', 'PATCH'), ctx(mine[0]!)))
      expect(read.s).toBe(200)
      expect(read.b.data.notification.read).toBe(true)
      expect((await j(await unreadGET(R('teacher2', '')))).b.data.count).toBe(before - 1)
      expect((await readPATCH(R('teacher2', '', 'PATCH'), ctx('nope'))).status).toBe(400)
      await readAllPATCH(R('teacher2', '', 'PATCH'))
      expect((await j(await unreadGET(R('teacher2', '')))).b.data.count).toBe(0)
      expect((await deleteNotification(R('teacher', '', 'DELETE'), ctx(mine[1]!))).status).toBe(404)
      expect((await deleteNotification(R('teacher2', '', 'DELETE'), ctx(mine[1]!))).status).toBe(200)
      expect((await deleteNotification(R('teacher2', '', 'DELETE'), ctx(mine[1]!))).status).toBe(404)
    })

    it('clears only the caller own notifications', async () => {
      const otherBefore = (await j(await listGET(R('teacher', '')))).b.data.totalDocs
      expect((await clearAllDELETE(new Request('http://localhost/api/notifications', { method: 'DELETE' }))).status).toBe(401)
      const cleared = await j(await clearAllDELETE(R('teacher2', '', 'DELETE')))
      expect(cleared.s).toBe(200)
      expect((await j(await listGET(R('teacher2', '')))).b.data.totalDocs).toBe(0)
      expect((await j(await listGET(R('teacher', '')))).b.data.totalDocs).toBe(otherBefore)
    })
  })
})
