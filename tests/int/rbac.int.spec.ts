import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as paymentsGET } from '@/app/api/admin/payments/route'
import { GET as testsGET, POST as testsPOST } from '@/app/api/admin/enquiry-tests/route'
import { GET as usersGET, POST as usersPOST } from '@/app/api/auth/admin/users/route'
import { GET as studentsGET, POST as studentsPOST } from '@/app/api/students/route'
import { GET as teachersGET } from '@/app/api/teachers/route'
import { GET as meGET } from '@/app/api/auth/me/route'
import { canRead, canWrite, permissionsFor } from '@/lib/permissions'

const PASSWORD = 'RbacSpecPass123!'
const ROLES = ['super_admin', 'operations_manager', 'student_counselor', 'teacher_coordinator', 'finance_manager', 'marketing_analyst', 'support_executive'] as const
const email = (r: string) => `rbac-${r}@example.com`
const tokens: Record<string, string> = {}
let payload: any

const req = (role: string, method = 'GET', body?: unknown, path = '/api/x') =>
  new Request(`http://localhost:3000${path}`, { method, headers: { Authorization: `Bearer ${tokens[role]}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })

describe('role based access', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    for (const r of ROLES) {
      const ex = await payload.find({ collection: 'users', where: { email: { equals: email(r) } }, limit: 1, overrideAccess: true })
      if (!ex.docs[0]) await payload.create({ collection: 'users', data: { email: email(r), password: PASSWORD, role: r, status: 'active' }, overrideAccess: true })
      tokens[r] = (await payload.login({ collection: 'users', data: { email: email(r), password: PASSWORD } })).token
    }
  })
  afterAll(async () => {
    for (const r of ROLES) await payload.delete({ collection: 'users', where: { email: { equals: email(r) } }, overrideAccess: true }).catch(() => undefined)
  })

  it('permission helpers', () => {
    expect(canWrite({ role: 'super_admin' }, 'users')).toBe(true)
    expect(canWrite({ role: 'student_counselor' }, 'students')).toBe(true)
    expect(canRead({ role: 'student_counselor' }, 'payments')).toBe(false)
    expect(canRead({ role: 'support_executive' }, 'students')).toBe(true)
    expect(canWrite({ role: 'support_executive' }, 'students')).toBe(false)
    expect(canRead({ role: 'teacher' }, 'students')).toBe(false)
    expect(canRead({ role: 'finance_manager', status: 'blocked' }, 'payments')).toBe(false)
    expect(permissionsFor({ role: 'marketing_analyst' })).toMatchObject({ analytics: 'read', student_inquiries: 'read' })
  })

  it('finance sees payments only', async () => {
    expect((await paymentsGET(req('finance_manager', 'GET', undefined, '/api/admin/payments'))).status).toBe(200)
    expect((await testsGET(req('finance_manager', 'GET', undefined, '/api/admin/enquiry-tests'))).status).toBe(403)
    expect((await usersGET(req('finance_manager', 'GET', undefined, '/api/auth/admin/users'))).status).toBe(403)
    expect((await paymentsGET(req('student_counselor', 'GET', undefined, '/api/admin/payments'))).status).toBe(403)
    expect((await paymentsGET(req('operations_manager', 'GET', undefined, '/api/admin/payments'))).status).toBe(403)
  })

  it('counselor works with tests and students, not users', { timeout: 30000 }, async () => {
    expect((await testsGET(req('student_counselor', 'GET', undefined, '/api/admin/enquiry-tests'))).status).toBe(200)
    expect((await studentsGET(req('student_counselor', 'GET', undefined, '/api/students'))).status).toBe(200)
    expect((await teachersGET(req('student_counselor', 'GET', undefined, '/api/teachers'))).status).toBe(200)
    expect((await usersGET(req('student_counselor', 'GET', undefined, '/api/auth/admin/users'))).status).toBe(403)
    // coordinator cannot touch student data
    expect((await studentsGET(req('teacher_coordinator', 'GET', undefined, '/api/students'))).status).toBe(403)
    expect((await teachersGET(req('teacher_coordinator', 'GET', undefined, '/api/teachers'))).status).toBe(200)
  })

  it('read-only roles cannot write', async () => {
    expect((await studentsGET(req('support_executive', 'GET', undefined, '/api/students'))).status).toBe(200)
    expect((await studentsPOST(req('support_executive', 'POST', { name: 'x' }, '/api/students'))).status).toBe(403)
    expect((await testsPOST(req('support_executive', 'POST', { studentEnquiryId: 1, mode: 'digital' }, '/api/admin/enquiry-tests'))).status).toBe(403)
    expect((await testsPOST(req('marketing_analyst', 'POST', { studentEnquiryId: 1, mode: 'digital' }, '/api/admin/enquiry-tests'))).status).toBe(403)
  })

  it('only the super admin manages users, and can create staff accounts', async () => {
    for (const r of ROLES.filter((x) => x !== 'super_admin')) expect((await usersGET(req(r))).status).toBe(403)
    expect((await usersGET(req('super_admin', 'GET', undefined, '/api/auth/admin/users'))).status).toBe(200)
    const created: any = await (await usersPOST(req('super_admin', 'POST', { email: 'rbac-new-staff@example.com', password: 'NewStaffPass123!', role: 'finance_manager' }, '/api/auth/admin/users'))).json()
    expect(JSON.stringify(created)).toContain('finance_manager')
    await payload.delete({ collection: 'users', where: { email: { equals: 'rbac-new-staff@example.com' } }, overrideAccess: true })
  })

  it('REST access follows the same rules', async () => {
    const asCounselor = { collection: 'payments', overrideAccess: false, user: { id: 0, role: 'student_counselor', status: 'active' } }
    await expect(payload.find(asCounselor)).rejects.toBeTruthy()
    const res = await payload.find({ collection: 'student-enquiries', overrideAccess: false, user: { id: 0, role: 'support_executive', status: 'active' }, limit: 1 })
    expect(res).toBeTruthy()
    await expect(payload.update({ collection: 'student-enquiries', id: 1, data: { adminNotes: 'x' }, overrideAccess: false, user: { id: 0, role: 'support_executive', status: 'active' } })).rejects.toBeTruthy()
  })

  it('me returns the permission map', async () => {
    const me: any = await (await meGET(req('operations_manager', 'GET', undefined, '/api/auth/me'))).json()
    expect(me.user.permissions.payments).toBeUndefined()
    expect(me.user.permissions.allocation).toBe('write')
  })

  it('finance can list student enquiries (students page) but not change them', async () => {
    const { GET } = await import('@/app/api/student-enquiries/route')
    const ok = await GET(new Request('http://localhost:3000/api/student-enquiries?limit=1', { headers: { Authorization: `Bearer ${tokens.finance_manager}` } }))
    expect(ok.status).toBe(200)
    await expect(payload.update({ collection: 'student-enquiries', id: 1, data: { adminNotes: 'x' }, overrideAccess: false, user: { id: 0, role: 'finance_manager', status: 'active' } })).rejects.toBeTruthy()
  })
})
