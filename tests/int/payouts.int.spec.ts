import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as teacherLedger } from '@/app/api/teachers/me/payouts/route'
import { GET as adminLedger, POST as adminRecord } from '@/app/api/admin/payments/payouts/route'
import { DELETE as adminUndo } from '@/app/api/admin/payments/payouts/[id]/route'

const PASSWORD = 'PayoutSpecPass123!'
const TEACHER = 'payout-spec-teacher@example.com'
const ADMIN = 'payout-spec-admin@example.com'
let payload: any
const tok: Record<string, string> = {}
const made: { users: number[]; profile: number; enquiry: number; student: number; alloc: number } = { users: [], profile: 0, enquiry: 0, student: 0, alloc: 0 }
const R = (who: string, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost:3000${path}`, { method, headers: { Authorization: `Bearer ${tok[who]}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const j = async (r: Response) => ({ s: r.status, b: (await r.json()) as any })
const monthAgo = (n: number) => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - n)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

describe('teacher payouts', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const tu = await payload.create({ collection: 'users', data: { email: TEACHER, password: PASSWORD, role: 'teacher', status: 'active' }, overrideAccess: true })
    const au = await payload.create({ collection: 'users', data: { email: ADMIN, password: PASSWORD, role: 'finance_manager', status: 'active' }, overrideAccess: true })
    made.users.push(tu.id, au.id)
    const e = await payload.create({ collection: 'teacher-enquiries', data: { fullName: 'Payout Spec', mobileNumber: '9876533001', email: 'payout-enq@example.com', highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-8', teachingLocality: 'Boring Road', preferredAvailability: 'Evenings', agreedToPolicy: true }, overrideAccess: true })
    made.enquiry = e.id
    const p = await payload.create({ collection: 'teacher-profiles', data: { name: 'Payout Spec', mobile: '9876533001', primarySubject: 'Maths', qualification: 'B.Ed', experienceYears: 2, classLevels: 'Class 6-8', locality: 'Boring Road', availability: 'Evenings', approvalStatus: 'approved', user: tu.id, teacherEnquiry: e.id }, overrideAccess: true })
    made.profile = p.id
    const s = await payload.create({ collection: 'students', data: { name: 'Payout Student', phoneNumber: '9876533002', studentClass: 'Class 7', subjects: [{ subject: 'Maths' }], locality: 'Kankarbagh', preferredTiming: 'Evening' }, overrideAccess: true })
    made.student = s.id
    const start = new Date()
    start.setUTCMonth(start.getUTCMonth() - 2)
    const a = await payload.create({ collection: 'teacher-allocations', data: { student: s.id, teacher: p.id, subject: 'Maths', status: 'accepted', allocatedBy: au.id, allocatedAt: start.toISOString(), monthlyFee: 3500, commissionPercent: 25, teacherPayout: 2600, commissionAmount: 900 }, overrideAccess: true })
    made.alloc = a.id
    for (const [k, email] of [['teacher', TEACHER], ['admin', ADMIN]] as const) tok[k] = (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token
  })
  afterAll(async () => {
    await payload.delete({ collection: 'teacher-payouts', where: { allocation: { equals: made.alloc } }, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-allocations', id: made.alloc, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'students', id: made.student, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-profiles', id: made.profile, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-enquiries', id: made.enquiry, overrideAccess: true }).catch(() => undefined)
    for (const id of made.users) await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
  })

  it('shows one due row per month, then paid after finance records it', { timeout: 30000 }, async () => {
    const before = await j(await teacherLedger(R('teacher', '/api/teachers/me/payouts')))
    expect(before.s).toBe(200)
    expect(before.b.data.rows).toHaveLength(3)
    expect(before.b.data.totals.pending).toBe(7800)
    expect(before.b.data.rows[0].studentName).toBe('Payout Student')

    const m = monthAgo(2)
    // a teacher cannot use the finance endpoints
    expect((await j(await adminRecord(R('teacher', '/api/admin/payments/payouts', 'POST', { allocationId: made.alloc, month: m })))).s).toBe(403)
    const rec = await j(await adminRecord(R('admin', '/api/admin/payments/payouts', 'POST', { allocationId: made.alloc, month: m, reference: 'UPI-1' })))
    expect(rec.s).toBe(201)
    expect(rec.b.data.amount).toBe(2600)
    expect((await j(await adminRecord(R('admin', '/api/admin/payments/payouts', 'POST', { allocationId: made.alloc, month: m })))).s).toBe(409)
    expect((await j(await adminRecord(R('admin', '/api/admin/payments/payouts', 'POST', { allocationId: made.alloc, month: monthAgo(6) })))).s).toBe(409)

    const after = await j(await teacherLedger(R('teacher', '/api/teachers/me/payouts')))
    expect(after.b.data.totals.received).toBe(2600)
    expect(after.b.data.totals.pending).toBe(5200)
    expect(after.b.data.rows.find((r: any) => r.month === m).reference).toBe('UPI-1')

    const admin = await j(await adminLedger(R('admin', `/api/admin/payments/payouts?month=${m}`)))
    expect(admin.b.data.rows.some((r: any) => r.allocationId === made.alloc && r.status === 'paid')).toBe(true)
    const undo = await j(await adminUndo(R('admin', `/api/admin/payments/payouts/${rec.b.data.id}`, 'DELETE'), { params: Promise.resolve({ id: String(rec.b.data.id) }) }))
    expect(undo.s).toBe(200)
  })
})
