import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const { sent, setVapidDetails, sendNotification } = vi.hoisted(() => {
  const sent: { endpoint: string; body: any }[] = []
  return {
    sent,
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, body: string) => {
      if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) })
    },
  }
})
vi.mock('web-push', () => ({ setVapidDetails, sendNotification, default: { setVapidDetails, sendNotification } }))

import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as configGET } from '@/app/api/push/config/route'
import { POST as subscribePOST } from '@/app/api/push/subscribe/route'
import { POST as unsubscribePOST } from '@/app/api/push/unsubscribe/route'
import { POST as testPOST } from '@/app/api/push/test/route'
import { POST as enquiryPOST } from '@/app/api/student-enquiries/route'

const PASSWORD = 'PushSpecPass123!'
const ROLES = ['student_counselor', 'finance_manager', 'teacher'] as const
const email = (r: string) => `push-${r}@example.com`
let payload: any
const tok: Record<string, string> = {}
const uid: Record<string, number> = {}
let enquiryId = 0

const R = (who: string, path: string, body?: unknown) =>
  new Request(`http://localhost:3000${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tok[who]}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const sub = (name: string) => ({ subscription: { endpoint: `https://push.example.com/${name}`, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } } })

describe('push notifications', () => {
  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPublicKeyForTestsOnly'
    process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'privateKeyForTestsOnly'
    payload = await getPayload({ config: await config })
    for (const r of ROLES) {
      const u = await payload.create({ collection: 'users', data: { email: email(r), password: PASSWORD, role: r, status: 'active' }, overrideAccess: true })
      uid[r] = u.id
      tok[r] = (await payload.login({ collection: 'users', data: { email: email(r), password: PASSWORD } })).token
    }
  })
  afterAll(async () => {
    await payload.delete({ collection: 'push-subscriptions', where: { endpoint: { contains: 'push.example.com' } }, overrideAccess: true }).catch(() => undefined)
    if (enquiryId) await payload.delete({ collection: 'student-enquiries', id: enquiryId, overrideAccess: true }).catch(() => undefined)
    for (const r of ROLES) await payload.delete({ collection: 'users', id: uid[r], overrideAccess: true }).catch(() => undefined)
  })

  it('exposes the public key and stores subscriptions per user', async () => {
    const cfg: any = await (await configGET(R('teacher', '/api/push/config'))).json()
    expect(cfg.data.enabled).toBe(true)
    expect(cfg.data.publicKey).toBeTruthy()
    expect((await subscribePOST(R('student_counselor', '/api/push/subscribe', sub('counselor')))).status).toBe(201)
    expect((await subscribePOST(R('finance_manager', '/api/push/subscribe', sub('finance')))).status).toBe(201)
    expect((await subscribePOST(R('teacher', '/api/push/subscribe', sub('teacher')))).status).toBe(201)
    // same browser again does not duplicate
    expect((await subscribePOST(R('teacher', '/api/push/subscribe', sub('teacher')))).status).toBe(201)
    const rows = await payload.find({ collection: 'push-subscriptions', where: { endpoint: { contains: 'push.example.com/teacher' } }, overrideAccess: true })
    expect(rows.totalDocs).toBe(1)
    // invalid
    expect((await subscribePOST(R('teacher', '/api/push/subscribe', { subscription: { endpoint: 'http://insecure', keys: {} } }))).status).toBe(400)
  })

  it('sends a test push only to the caller', async () => {
    sent.length = 0
    const res: any = await (await testPOST(R('teacher', '/api/push/test', {}))).json()
    expect(res.data.sent).toBe(1)
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.example.com/teacher'])
  })

  it('a new student enquiry alerts the right staff, not finance or teachers', { timeout: 30000 }, async () => {
    sent.length = 0
    const r = await enquiryPOST(new Request('http://localhost:3000/api/student-enquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Push Spec Student', phoneNumber: '9876544001', studentClass: 'Class 6', subjects: ['Maths'], preferredTiming: 'Evening', locality: 'Kankarbagh', budgetRange: 'Rs 2000', agreedToPolicy: true }),
    }))
    const json: any = await r.json()
    enquiryId = json.enquiry?.id
    await new Promise((res) => setTimeout(res, 800))
    const targets = sent.map((s) => s.endpoint)
    expect(targets).toContain('https://push.example.com/counselor')
    expect(targets).not.toContain('https://push.example.com/finance')
    expect(targets).not.toContain('https://push.example.com/teacher')
    expect(sent.find((s) => s.endpoint.endsWith('counselor'))!.body.url).toBe(`/admin/student-enquiries/${enquiryId}`)
  })

  it('drops subscriptions the browser no longer accepts, and can unsubscribe', async () => {
    await subscribePOST(R('student_counselor', '/api/push/subscribe', sub('gone')))
    await testPOST(R('student_counselor', '/api/push/test', {}))
    await new Promise((res) => setTimeout(res, 300))
    const gone = await payload.find({ collection: 'push-subscriptions', where: { endpoint: { contains: 'push.example.com/gone' } }, overrideAccess: true })
    expect(gone.totalDocs).toBe(0)
    expect((await unsubscribePOST(R('teacher', '/api/push/unsubscribe', { endpoint: 'https://push.example.com/teacher' }))).status).toBe(200)
    const left = await payload.find({ collection: 'push-subscriptions', where: { endpoint: { contains: 'push.example.com/teacher' } }, overrideAccess: true })
    expect(left.totalDocs).toBe(0)
  })
})
