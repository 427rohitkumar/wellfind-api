import { createHmac } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as razorpayPayout } from '@/app/api/admin/payments/payouts/razorpay/route'
import { POST as manualPayout } from '@/app/api/admin/payments/payouts/route'
import { POST as razorpayWebhook } from '@/app/api/payments/razorpay/webhook/route'

// Razorpay is always faked here: no request ever leaves the machine and no money can move.
const PASSWORD = 'RzpSpecPass123!'
const ADMIN = 'rzp-payout-spec-admin@example.com'
const ACCOUNT = '0000000000000000'
let payload: any
let token = ''
const made = { user: 0, enquiry: 0, profile: 0, student: 0, alloc: 0 }

const month = (() => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
})()
const reference = () => `PO_${made.alloc}_${month.replace('-', '')}`

const request = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const pay = async (change: { amount?: number; upiId?: string } = {}) => {
  const res = await razorpayPayout(request('/api/admin/payments/payouts/razorpay', { allocationId: made.alloc, month, amount: 2600, upiId: 'teacher@upi', teacherName: 'Rzp Spec', ...change }))
  return { status: res.status, body: (await res.json()) as any }
}
const saved = { methods: [{ id: 'upi-1', type: 'upi', upiId: 'teacher@upi', isPrimary: true }], primaryId: 'upi-1' }
const saveSettings = (payoutSettings: unknown) =>
  payload.update({ collection: 'teacher-profiles', id: made.profile, data: { payoutSettings }, overrideAccess: true })
const setDue = (teacherPayout: number | null) =>
  payload.update({ collection: 'teacher-allocations', id: made.alloc, data: { teacherPayout }, overrideAccess: true })
const recorded = async () =>
  (await payload.find({ collection: 'teacher-payouts', where: { allocation: { equals: made.alloc } }, depth: 0, overrideAccess: true })).docs as any[]

type Reply = { status?: number; json: unknown } | 'network-error'
let calls: { method: string; url: string; headers: Record<string, string>; body: any }[] = []
/** Answers the lookup (GET) and, when given, the create (POST). */
function fakeRazorpay(lookup: Reply, create?: Reply) {
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    const method = init?.method ?? 'GET'
    calls.push({ method, url: String(url), headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : null })
    const reply = method === 'GET' ? lookup : create
    if (!reply) throw new Error(`unexpected ${method} to Razorpay`)
    if (reply === 'network-error') throw new Error('socket hang up')
    return Response.json(reply.json, { status: reply.status ?? 200 })
  })
}
const list = (...items: unknown[]): Reply => ({ json: { entity: 'collection', count: items.length, items } })
const payout = (status: string, extra: object = {}) => ({ id: `pout_${status}`, status, amount: 260000, reference_id: reference(), utr: status === 'processed' ? 'UTR123' : null, ...extra })
const posts = () => calls.filter((c) => c.method === 'POST')

describe('razorpay teacher payouts', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const user = await payload.create({ collection: 'users', data: { email: ADMIN, password: PASSWORD, role: 'finance_manager', status: 'active' }, overrideAccess: true })
    made.user = user.id
    const e = await payload.create({ collection: 'teacher-enquiries', data: { fullName: 'Rzp Spec', mobileNumber: '9876533101', email: 'rzp-payout-enq@example.com', highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-8', teachingLocality: 'Boring Road', preferredAvailability: 'Evenings', agreedToPolicy: true }, overrideAccess: true })
    made.enquiry = e.id
    const p = await payload.create({ collection: 'teacher-profiles', data: { name: 'Rzp Spec', mobile: '9876533101', primarySubject: 'Maths', qualification: 'B.Ed', experienceYears: 2, classLevels: 'Class 6-8', locality: 'Boring Road', availability: 'Evenings', approvalStatus: 'approved', teacherEnquiry: e.id }, overrideAccess: true })
    made.profile = p.id
    const s = await payload.create({ collection: 'students', data: { name: 'Rzp Student', phoneNumber: '9876533102', studentClass: 'Class 7', subjects: [{ subject: 'Maths' }], locality: 'Kankarbagh', preferredTiming: 'Evening' }, overrideAccess: true })
    made.student = s.id
    const a = await payload.create({ collection: 'teacher-allocations', data: { student: s.id, teacher: p.id, subject: 'Maths', status: 'accepted', allocatedBy: user.id, allocatedAt: new Date().toISOString(), monthlyFee: 3500, commissionPercent: 25, teacherPayout: 2600, commissionAmount: 900 }, overrideAccess: true })
    made.alloc = a.id
    token = (await payload.login({ collection: 'users', data: { email: ADMIN, password: PASSWORD } })).token
  })
  beforeEach(async () => {
    await saveSettings(saved)
    await setDue(2600)
    calls = []
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_spec')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'spec-secret')
    vi.stubEnv('RAZORPAY_ACCOUNT_NUMBER', ACCOUNT)
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    await payload.delete({ collection: 'teacher-payouts', where: { allocation: { equals: made.alloc } }, overrideAccess: true })
  })
  afterAll(async () => {
    await payload.delete({ collection: 'teacher-allocations', id: made.alloc, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'students', id: made.student, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-profiles', id: made.profile, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-enquiries', id: made.enquiry, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'users', id: made.user, overrideAccess: true }).catch(() => undefined)
  })

  it('sends nothing without an account number', async () => {
    vi.stubEnv('RAZORPAY_ACCOUNT_NUMBER', '')
    fakeRazorpay(list())
    const res = await pay()
    expect(res.status).toBe(503)
    expect(res.body.message).toContain('RAZORPAY_ACCOUNT_NUMBER')
    expect(calls).toHaveLength(0)
    expect(await recorded()).toHaveLength(0)
  })

  it('records a processed payout, using the configured account and an idempotency key', async () => {
    fakeRazorpay(list(), { json: payout('processed') })
    const res = await pay()
    expect(res.body.data.success).toBe(true)
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body.account_number).toBe(ACCOUNT)
    expect(posts()[0].body.reference_id).toBe(reference())
    expect(posts()[0].body.narration).toMatch(/^[A-Za-z0-9 ]{1,30}$/)
    expect(posts()[0].headers['X-Payout-Idempotency']).toMatch(/^[a-f0-9]{32}$/)
    const rows = await recorded()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 2600, paymentMethod: 'razorpay', razorpayPayoutId: 'pout_processed', utr: 'UTR123' })
  })

  it.each(['queued', 'pending', 'processing', 'scheduled', 'something_new'])('does not mark a %s payout as paid', async (status) => {
    fakeRazorpay(list(), { json: payout(status) })
    const { data } = (await pay()).body
    expect(data).toMatchObject({ success: false, pending: true, fallbackToManual: false })
    expect(data.upiUri).toBeUndefined()
    expect(await recorded()).toHaveLength(0)
  })

  it('does not send a second payout while one is in progress, then records it once processed', async () => {
    fakeRazorpay(list(payout('processing')))
    expect((await pay()).body.data.pending).toBe(true)
    fakeRazorpay(list(payout('processed')))
    expect((await pay()).body.data.success).toBe(true)
    expect(posts()).toHaveLength(0)
    expect(await recorded()).toHaveLength(1)
  })

  it('sends a new payout with a new key after a failed one', async () => {
    fakeRazorpay(list(), { json: payout('queued') })
    await pay()
    fakeRazorpay(list(payout('failed')), { json: payout('processed') })
    expect((await pay()).body.data.success).toBe(true)
    expect(posts()).toHaveLength(2)
    expect(posts()[1].headers['X-Payout-Idempotency']).not.toBe(posts()[0].headers['X-Payout-Idempotency'])
  })

  it.each<[string, Reply]>([
    ['no answer', 'network-error'],
    ['a server error', { status: 502, json: {} }],
    ['a conflict', { status: 409, json: {} }],
  ])('treats %s on create as unconfirmed, not as safe to pay by hand', async (_name, reply) => {
    fakeRazorpay(list(), reply)
    expect((await pay()).body.data).toMatchObject({ pending: true, fallbackToManual: false })
    expect(await recorded()).toHaveLength(0)
  })

  it('sends nothing when the existing payouts cannot be checked', async () => {
    fakeRazorpay('network-error')
    expect((await pay()).body.data).toMatchObject({ pending: true, fallbackToManual: false })
    expect(posts()).toHaveLength(0)
  })

  it('offers manual payment when Razorpay refuses or the payout fails', async () => {
    fakeRazorpay(list(), { status: 400, json: { error: { description: 'Invalid VPA' } } })
    expect((await pay()).body.data).toMatchObject({ success: false, fallbackToManual: true, message: 'Invalid VPA' })
    fakeRazorpay(list(), { json: payout('rejected') })
    expect((await pay()).body.data.fallbackToManual).toBe(true)
    expect(await recorded()).toHaveLength(0)
  })

  it.each<[string, { amount?: number; upiId?: string }, string]>([
    ['a UPI ID the teacher has not saved', { upiId: 'someone-else@upi' }, 'not saved'],
    ['more than the amount due', { amount: 26000 }, 'amount due'],
    ['less than the amount due', { amount: 2599.99 }, 'amount due'],
  ])('sends nothing to %s', async (_name, change, message) => {
    fakeRazorpay(list(), { json: payout('processed') })
    const res = await pay(change)
    expect(res.status).toBe(409)
    expect(res.body.message).toContain(message)
    expect(posts()).toHaveLength(0)
    expect(await recorded()).toHaveLength(0)
  })

  it('sends nothing when the teacher has no saved UPI ID', async () => {
    await saveSettings({ methods: [{ id: 'bank-1', type: 'bank', accountNumber: '000011112222' }], primaryId: 'bank-1' })
    fakeRazorpay(list(), { json: payout('processed') })
    expect((await pay()).status).toBe(409)
    expect(posts()).toHaveLength(0)
  })

  it('sends nothing when the allocation has no payout amount', async () => {
    await setDue(null)
    fakeRazorpay(list(), { json: payout('processed') })
    expect((await pay()).status).toBe(409)
    expect(posts()).toHaveLength(0)
  })

  it('gives no payment link for unsaved details when Razorpay refuses the check', async () => {
    fakeRazorpay({ status: 401, json: { error: { description: 'Authentication failed' } } })
    const res = await pay({ upiId: 'someone-else@upi' })
    expect(res.status).toBe(409)
    expect(JSON.stringify(res.body)).not.toContain('upi://')
  })

  it('sends the saved UPI ID, from either saved format, whatever the letter case of the request', async () => {
    await saveSettings({ upiId: 'Teacher@UPI' })
    fakeRazorpay(list(), { json: payout('processed') })
    expect((await pay()).body.data.success).toBe(true)
    expect(posts()[0].body.fund_account.vpa.address).toBe('Teacher@UPI')
    expect(posts()[0].body.amount).toBe(260000)
  })

  it('still records a payout already processed after the saved details have changed', async () => {
    await saveSettings({ methods: [], primaryId: null })
    await setDue(3000)
    fakeRazorpay(list(payout('processed')))
    expect((await pay()).body.data.success).toBe(true)
    expect(posts()).toHaveLength(0)
    expect((await recorded())[0]).toMatchObject({ amount: 2600 })
  })

  it('never calls Razorpay for a month that is already paid manually', async () => {
    fakeRazorpay(list())
    const manual = await manualPayout(request('/api/admin/payments/payouts', { allocationId: made.alloc, month, reference: 'UPI-MANUAL' }))
    expect(manual.status).toBe(201)
    calls = []
    fakeRazorpay(list(), { json: payout('processed') })
    expect((await pay()).status).toBe(409)
    expect(calls).toHaveLength(0)
    expect(await recorded()).toHaveLength(1)
  })

  it('blocks manual payout recording while a Razorpay payout is in progress or processed', async () => {
    fakeRazorpay(list(payout('processing')))
    const res = await manualPayout(request('/api/admin/payments/payouts', { allocationId: made.alloc, month, reference: 'UPI-MANUAL' }))
    expect(res.status).toBe(409)
    expect((await res.json()).message).toContain('in progress')
    expect(await recorded()).toHaveLength(0)
  })

  it('records a waiting payout via payout.processed webhook and is idempotent', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'whsec_test_secret')
    const eventBody = JSON.stringify({
      event: 'payout.processed',
      payload: { payout: { entity: { id: 'pout_wh_1', status: 'processed', amount: 260000, reference_id: reference(), utr: 'UTR_WH_1' } } },
    })
    const sig = createHmac('sha256', 'whsec_test_secret').update(eventBody).digest('hex')
    const sendWebhook = (eventId: string) =>
      razorpayWebhook(
        new Request('http://localhost:3000/api/payments/razorpay/webhook', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': eventId },
          body: eventBody,
        }),
      )

    const first = await sendWebhook('evt_wh_1')
    expect(first.status).toBe(200)
    const rows = await recorded()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 2600, paymentMethod: 'razorpay', razorpayPayoutId: 'pout_wh_1', utr: 'UTR_WH_1' })

    const dup = await sendWebhook('evt_wh_2')
    expect(dup.status).toBe(200)
    expect(await recorded()).toHaveLength(1)
  })

  it('removes a recorded payout when payout.reversed webhook arrives', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'whsec_test_secret')
    fakeRazorpay(list(), { json: payout('processed', { id: 'pout_rev_1' }) })
    expect((await pay()).body.data.success).toBe(true)
    expect(await recorded()).toHaveLength(1)

    const revBody = JSON.stringify({
      event: 'payout.reversed',
      payload: { payout: { entity: { id: 'pout_rev_1', status: 'reversed', reference_id: reference() } } },
    })
    const sig = createHmac('sha256', 'whsec_test_secret').update(revBody).digest('hex')
    const res = await razorpayWebhook(
      new Request('http://localhost:3000/api/payments/razorpay/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_rev_1' },
        body: revBody,
      }),
    )
    expect(res.status).toBe(200)
    expect(await recorded()).toHaveLength(0)
  })

  it('ignores payout.failed webhook without recording a payout', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'whsec_test_secret')
    const failBody = JSON.stringify({
      event: 'payout.failed',
      payload: { payout: { entity: { id: 'pout_fail_1', status: 'failed', reference_id: reference() } } },
    })
    const sig = createHmac('sha256', 'whsec_test_secret').update(failBody).digest('hex')
    const res = await razorpayWebhook(
      new Request('http://localhost:3000/api/payments/razorpay/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_fail_1' },
        body: failBody,
      }),
    )
    expect(res.status).toBe(200)
    expect(await recorded()).toHaveLength(0)
  })
})
