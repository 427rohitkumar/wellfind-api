import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as orderRoute } from '@/app/api/teacher-applications/me/payment/order/route'
import { POST as verifyRoute } from '@/app/api/teacher-applications/me/payment/verify/route'
import { GET as meRoute } from '@/app/api/teacher-applications/me/route'
import { POST as webhookRoute } from '@/app/api/payments/razorpay/webhook/route'
import { GET as listRoute } from '@/app/api/admin/payments/route'
import { GET as statsRoute } from '@/app/api/admin/payments/stats/route'
import { POST as createAccountRoute } from '@/app/api/teacher-enquiries/[id]/create-account/route'

const KEY_SECRET = 'spec_key_secret'
const WEBHOOK_SECRET = 'spec_webhook_secret'
const TAG = `${Date.now()}`
const PASSWORD = 'PaySpecPass123!'
const ADMIN_EMAIL = 'pay-spec-admin@example.com'

let payload: any
let adminToken = ''
const enquiryIds: number[] = []
const emails: string[] = [ADMIN_EMAIL]
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

const sign = (orderId: string, paymentId: string) => createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')

function req(token: string | undefined, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/x', {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })
}

// ---- fake Razorpay -------------------------------------------------------
let orderCounter = 0
const orders = new Map<string, { amount: number }>()
const payments = new Map<string, any>()
const realFetch = globalThis.fetch
function fakeRazorpay(url: string, init: any) {
  const path = url.replace('https://api.razorpay.com/v1', '')
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  if (path === '/orders' && init.method === 'POST') {
    const body = JSON.parse(init.body)
    const id = `order_SPEC${TAG}_${++orderCounter}`
    orders.set(id, { amount: body.amount })
    return json({ id, amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' })
  }
  const m = path.match(/^\/payments\/([^/]+)(\/capture)?$/)
  if (m) {
    const p = payments.get(m[1]!)
    if (!p) return json({ error: { description: 'not found' } }, 404)
    if (m[2]) p.status = 'captured'
    return json(p)
  }
  return json({ error: { description: 'unexpected call' } }, 500)
}

async function makeTeacher(label: string) {
  const email = `pay-${label}-${TAG}@example.com`
  emails.push(email)
  const e = await payload.create({
    collection: 'teacher-enquiries',
    data: {
      fullName: `Pay Spec ${label}`, mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`, email,
      highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-10',
      teachingLocality: 'Patna', preferredAvailability: 'Evening', agreedToPolicy: true,
    },
  })
  enquiryIds.push(Number(e.id))
  await payload.update({ collection: 'teacher-enquiries', id: e.id, data: { applicationStatus: 'under_review' } })
  expect((await createAccountRoute(req(adminToken, 'POST', { password: 'PaySpecTeach42' }), ctx(e.id))).status).toBe(201)
  const token = (await payload.login({ collection: 'users', data: { email, password: 'PaySpecTeach42' } })).token as string
  return { id: Number(e.id), email, token }
}

describe('Razorpay registration payments', () => {
  beforeAll(async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_spec'
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
    vi.stubGlobal('fetch', (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url
      return url.startsWith('https://api.razorpay.com') ? Promise.resolve(fakeRazorpay(url, init ?? {})) : realFetch(input, init)
    })
    payload = await getPayload({ config: await config })
    const ex = await payload.find({ collection: 'users', where: { email: { equals: ADMIN_EMAIL } }, limit: 1, overrideAccess: true })
    if (!ex.docs[0]) await payload.create({ collection: 'users', data: { email: ADMIN_EMAIL, password: PASSWORD, role: 'super_admin', status: 'active' }, overrideAccess: true })
    adminToken = (await payload.login({ collection: 'users', data: { email: ADMIN_EMAIL, password: PASSWORD } })).token
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_KEY_SECRET
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    for (const id of enquiryIds) {
      await payload.delete({ collection: 'payments', where: { teacherEnquiry: { equals: id } }, overrideAccess: true }).catch(() => undefined)
      await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const email of emails) {
      const u = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
      if (u.docs[0]) await payload.delete({ collection: 'users', id: u.docs[0].id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('requires a shortlisted application and a teacher login', async () => {
    expect((await orderRoute(req(undefined, 'POST'))).status).toBe(401)
    expect((await orderRoute(req(adminToken, 'POST'))).status).toBe(403)
    const t = await makeTeacher('early')
    expect((await orderRoute(req(t.token, 'POST'))).status).toBe(409)
  })

  it('creates an order with a server-decided amount, reuses it, and settles the fee after a verified payment', async () => {
    const t = await makeTeacher('checkout')
    await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { applicationStatus: 'shortlisted' } })

    const me = (await (await meRoute(req(t.token))).json()).data
    expect(me.payment.online.enabled).toBe(true)

    const res = await orderRoute(req(t.token, 'POST', { amount: 1 }))
    expect(res.status).toBe(201)
    const order = (await res.json()).data
    expect(order.keyId).toBe('rzp_test_spec')
    expect(order.amountPaise).toBe(100000)
    expect(JSON.stringify(order)).not.toContain(KEY_SECRET)
    const again = (await (await orderRoute(req(t.token, 'POST'))).json()).data
    expect(again.orderId).toBe(order.orderId)

    const payId = `pay_ok_${TAG}`
    payments.set(payId, { id: payId, order_id: order.orderId, amount: 100000, currency: 'INR', status: 'authorized', method: 'upi' })

    // Wrong signature: nothing changes.
    const bad = await verifyRoute(req(t.token, 'POST', { razorpay_order_id: order.orderId, razorpay_payment_id: payId, razorpay_signature: 'nope' }))
    expect(bad.status).toBe(400)
    expect((await payload.findByID({ collection: 'teacher-enquiries', id: t.id, overrideAccess: true })).registrationFee.status).not.toBe('paid')

    const ok = await verifyRoute(req(t.token, 'POST', { razorpay_order_id: order.orderId, razorpay_payment_id: payId, razorpay_signature: sign(order.orderId, payId) }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.settled).toBe(true)

    const enquiry = await payload.findByID({ collection: 'teacher-enquiries', id: t.id, overrideAccess: true })
    expect(enquiry.registrationFee).toMatchObject({ status: 'paid', paymentMethod: 'razorpay', transactionRef: payId })
    expect(enquiry.registrationFee.expiresAt).toBeTruthy()

    const rows = await payload.find({ collection: 'payments', where: { teacherEnquiry: { equals: t.id } }, overrideAccess: true })
    expect(rows.docs).toHaveLength(1)
    expect(rows.docs[0]).toMatchObject({ status: 'paid', method: 'upi', razorpayPaymentId: payId, category: 'teacher_registration', mode: 'test' })

    const mails = await payload.find({ collection: 'email-logs', where: { and: [{ recipient: { equals: t.email } }, { template: { equals: 'teacher_payment_received' } }] }, overrideAccess: true })
    expect(mails.docs).toHaveLength(1)

    // Idempotent: verifying again or paying again does nothing new.
    expect((await verifyRoute(req(t.token, 'POST', { razorpay_order_id: order.orderId, razorpay_payment_id: payId, razorpay_signature: sign(order.orderId, payId) }))).status).toBe(200)
    expect((await orderRoute(req(t.token, 'POST'))).status).toBe(409)
  })

  it('rejects a payment whose amount does not match the order', async () => {
    const t = await makeTeacher('mismatch')
    await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { applicationStatus: 'shortlisted' } })
    const order = (await (await orderRoute(req(t.token, 'POST'))).json()).data
    const payId = `pay_low_${TAG}`
    payments.set(payId, { id: payId, order_id: order.orderId, amount: 100, currency: 'INR', status: 'captured' })
    const res = await verifyRoute(req(t.token, 'POST', { razorpay_order_id: order.orderId, razorpay_payment_id: payId, razorpay_signature: sign(order.orderId, payId) }))
    expect(res.status).toBe(400)
    expect((await payload.findByID({ collection: 'teacher-enquiries', id: t.id, overrideAccess: true })).registrationFee.status).not.toBe('paid')
  })

  describe('webhook', () => {
    const post = (body: unknown, secret = WEBHOOK_SECRET, eventId = `evt_${Math.random()}`) => {
      const raw = JSON.stringify(body)
      return webhookRoute(
        new Request('http://localhost:3000/api/payments/razorpay/webhook', {
          method: 'POST',
          headers: { 'x-razorpay-signature': createHmac('sha256', secret).update(raw).digest('hex'), 'x-razorpay-event-id': eventId },
          body: raw,
        }),
      )
    }

    it('rejects bad signatures and ignores unknown orders', async () => {
      expect((await post({ event: 'payment.captured' }, 'wrong')).status).toBe(400)
      expect((await post({ event: 'payment.captured', payload: { payment: { entity: { id: 'x', order_id: 'order_unknown', amount: 1 } } } })).status).toBe(200)
    })

    it('settles the fee automatically when the browser never came back, and ignores duplicates', async () => {
      const t = await makeTeacher('hook')
      await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { applicationStatus: 'shortlisted' } })
      const order = (await (await orderRoute(req(t.token, 'POST'))).json()).data
      const payId = `pay_hook_${TAG}`
      const entity = { id: payId, order_id: order.orderId, amount: 100000, status: 'captured', method: 'card' }

      // A failed attempt first, then success on the same order.
      expect((await post({ event: 'payment.failed', payload: { payment: { entity: { ...entity, id: 'pay_f', status: 'failed', error_description: 'Card declined' } } } })).status).toBe(200)
      let row = (await payload.find({ collection: 'payments', where: { razorpayOrderId: { equals: order.orderId } }, overrideAccess: true })).docs[0]
      expect(row.status).toBe('failed')
      expect(row.failureReason).toMatch(/declined/)

      expect((await post({ event: 'payment.captured', payload: { payment: { entity } } }, WEBHOOK_SECRET, 'evt_same')).status).toBe(200)
      row = (await payload.find({ collection: 'payments', where: { razorpayOrderId: { equals: order.orderId } }, overrideAccess: true })).docs[0]
      expect(row).toMatchObject({ status: 'paid', method: 'card', razorpayPaymentId: payId })
      expect((await payload.findByID({ collection: 'teacher-enquiries', id: t.id, overrideAccess: true })).registrationFee.status).toBe('paid')

      const eventsBefore = row.events.length
      expect((await post({ event: 'payment.captured', payload: { payment: { entity } } }, WEBHOOK_SECRET, 'evt_same')).status).toBe(200)
      const after = (await payload.find({ collection: 'payments', where: { razorpayOrderId: { equals: order.orderId } }, overrideAccess: true })).docs[0]
      expect(after.events.length).toBe(eventsBefore)
    })
  })

  describe('yearly renewal', () => {
    async function approvedTeacher(label: string, expiresInDays: number) {
      const t = await makeTeacher(label)
      await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { applicationStatus: 'shortlisted' } })
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { registrationFee: { status: 'paid', expiresAt } } })
      await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { applicationStatus: 'approved' } })
      return { ...t, expiresAt }
    }

    it('keeps a valid registration closed to payment until the renewal window opens', async () => {
      const t = await approvedTeacher('valid', 200)
      const me = (await (await meRoute(req(t.token))).json()).data
      expect(me.registration).toMatchObject({ state: 'active', canRenew: false })
      expect((await orderRoute(req(t.token, 'POST'))).status).toBe(409)
    })

    it('renews for another year from the old expiry, updates the profile and emails the receipt once', async () => {
      const t = await approvedTeacher('renew', 10)
      const me = (await (await meRoute(req(t.token))).json()).data
      expect(me.registration).toMatchObject({ state: 'expiring', canRenew: true })
      expect(me.payment.canPay).toBe(true)

      const order = (await (await orderRoute(req(t.token, 'POST'))).json()).data
      expect(order.description).toMatch(/renewal/i)
      const payId = `pay_renew_${TAG}`
      payments.set(payId, { id: payId, order_id: order.orderId, amount: 100000, currency: 'INR', status: 'captured', method: 'card' })
      const ok = await verifyRoute(req(t.token, 'POST', { razorpay_order_id: order.orderId, razorpay_payment_id: payId, razorpay_signature: sign(order.orderId, payId) }))
      expect(ok.status).toBe(200)

      const enquiry = await payload.findByID({ collection: 'teacher-enquiries', id: t.id, overrideAccess: true })
      const newExpiry = new Date(enquiry.registrationFee.expiresAt).getTime()
      const expected = new Date(t.expiresAt).getTime() + 365 * 86_400_000
      expect(Math.abs(newExpiry - expected)).toBeLessThan(5000)
      expect(enquiry.registrationFee.transactionRef).toBe(payId)

      const profile = (await payload.find({ collection: 'teacher-profiles', where: { teacherEnquiry: { equals: t.id } }, overrideAccess: true })).docs[0]
      expect(profile).toBeTruthy()
      expect(Math.abs(new Date(profile.registrationFee.expiresAt).getTime() - expected)).toBeLessThan(5000)

      const mails = (await payload.find({ collection: 'email-logs', where: { and: [{ recipient: { equals: t.email } }, { template: { equals: 'teacher_payment_received' } }] }, overrideAccess: true })).docs
      const renewalMails = mails.filter((m: any) => m.dedupeKey === `payment_received:${t.id}:${payId}`)
      expect(renewalMails).toHaveLength(1)
      expect(renewalMails[0].templateData.renewal).toBe(true)

      // The ledger shows it as a registration renewal; paying again now is closed.
      const row = (await payload.find({ collection: 'payments', where: { razorpayOrderId: { equals: order.orderId } }, overrideAccess: true })).docs[0]
      expect(row).toMatchObject({ status: 'paid', category: 'teacher_registration', description: 'Teacher registration renewal' })
      expect((await orderRoute(req(t.token, 'POST'))).status).toBe(409)
    })

    it('lets a teacher renew after the registration has expired, counting the year from today', async () => {
      const t = await approvedTeacher('expired', -3)
      const me = (await (await meRoute(req(t.token))).json()).data
      expect(me.registration).toMatchObject({ state: 'expired', canRenew: true })
      const order = (await (await orderRoute(req(t.token, 'POST'))).json()).data
      const payId = `pay_exp_${TAG}`
      payments.set(payId, { id: payId, order_id: order.orderId, amount: 100000, currency: 'INR', status: 'captured', method: 'upi' })
      expect((await verifyRoute(req(t.token, 'POST', { razorpay_order_id: order.orderId, razorpay_payment_id: payId, razorpay_signature: sign(order.orderId, payId) }))).status).toBe(200)
      const fee = (await payload.findByID({ collection: 'teacher-enquiries', id: t.id, overrideAccess: true })).registrationFee
      const days = (new Date(fee.expiresAt).getTime() - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(364)
      expect(days).toBeLessThan(366)
    })
  })

  describe('admin ledger', () => {
    it('lists payments and reports category analytics', async () => {
      const t = await makeTeacher('manual')
      await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { applicationStatus: 'shortlisted' } })
      // Marked paid by hand: still lands in the Payments ledger.
      await payload.update({ collection: 'teacher-enquiries', id: t.id, data: { registrationFee: { status: 'paid' } } })
      const manual = await payload.find({ collection: 'payments', where: { teacherEnquiry: { equals: t.id } }, overrideAccess: true })
      expect(manual.docs[0]).toMatchObject({ status: 'paid', gateway: 'manual', category: 'teacher_registration' })

      expect((await listRoute(req(undefined))).status).toBe(401)
      const list = (await (await listRoute(new Request('http://localhost:3000/api/x?category=teacher_registration&status=paid', { headers: { Authorization: `Bearer ${adminToken}` } }))).json()).data
      expect(list.totalDocs).toBeGreaterThanOrEqual(3)
      expect(list.docs.every((d: any) => d.status === 'paid' && d.category === 'teacher_registration')).toBe(true)

      const stats = (await (await statsRoute(req(adminToken))).json()).data
      expect(stats.totals.collected).toBeGreaterThanOrEqual(3000)
      expect(stats.byCategory.map((c: any) => c.key)).toEqual(['teacher_registration', 'tuition_fee', 'other'])
      expect(stats.byCategory[0].paidCount).toBeGreaterThanOrEqual(3)
      expect(stats.months).toHaveLength(6)
      expect(stats.totals.testCount).toBeGreaterThanOrEqual(2)
      const testOnly = (await (await listRoute(new Request('http://localhost:3000/api/x?mode=test', { headers: { Authorization: `Bearer ${adminToken}` } }))).json()).data
      expect(testOnly.docs.length).toBeGreaterThan(0)
      expect(testOnly.docs.every((d: any) => d.mode === 'test')).toBe(true)
      expect(stats.gateway.configured).toBe(true)
      expect(JSON.stringify(stats)).not.toContain(KEY_SECRET)
    })
  })
})
