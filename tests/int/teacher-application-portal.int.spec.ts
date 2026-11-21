import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as meRoute } from '@/app/api/teacher-applications/me/route'
import { POST as docsRoute } from '@/app/api/teacher-applications/me/documents/route'
import { POST as payRoute } from '@/app/api/teacher-applications/me/payment/route'
import { POST as createAccountRoute } from '@/app/api/teacher-enquiries/[id]/create-account/route'

let payload: any
let adminToken = ''
let studentlessAdminToken = ''
const TAG = `${Date.now()}`
const PASSWORD = 'PortalSpecPass123!'
const ADMIN_EMAIL = 'portal-spec-admin@example.com'
const TEACHER_EMAIL = `portal-spec-${TAG}@example.com`
const enquiryIds: number[] = []
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

function req(token: string | undefined, body?: unknown | FormData): Request {
  const isForm = body instanceof FormData
  return new Request('http://localhost:3000/api/x', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
  })
}

const pdf = (name = 'aadhaar.pdf') => new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], name, { type: 'application/pdf' })

describe('Teacher portal — own application, documents and payment', () => {
  let teacherToken = ''
  let enquiryId = 0

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ex = await payload.find({ collection: 'users', where: { email: { equals: ADMIN_EMAIL } }, limit: 1, overrideAccess: true })
    if (!ex.docs[0]) {
      await payload.create({ collection: 'users', data: { email: ADMIN_EMAIL, password: PASSWORD, role: 'super_admin', status: 'active' }, overrideAccess: true })
    }
    adminToken = (await payload.login({ collection: 'users', data: { email: ADMIN_EMAIL, password: PASSWORD } })).token
    studentlessAdminToken = adminToken

    const e = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: `Portal Spec ${TAG}`,
        mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        email: TEACHER_EMAIL,
        highestQualification: 'B.Ed',
        teachingExperience: '2 years',
        primarySubject: 'Maths',
        classLevel: 'Class 6-10',
        teachingLocality: 'Patna',
        preferredAvailability: 'Evening',
        agreedToPolicy: true,
      },
    })
    enquiryId = Number(e.id)
    enquiryIds.push(enquiryId)
    await payload.update({ collection: 'teacher-enquiries', id: enquiryId, data: { applicationStatus: 'under_review' } })
    const created = await createAccountRoute(req(adminToken, { password: 'TeacherPortal42' }), ctx(enquiryId))
    expect(created.status).toBe(201)
    teacherToken = (await payload.login({ collection: 'users', data: { email: TEACHER_EMAIL, password: 'TeacherPortal42' } })).token
  })

  afterAll(async () => {
    for (const id of enquiryIds) {
      const doc = await payload.findByID({ collection: 'teacher-enquiries', id, overrideAccess: true, depth: 0, disableErrors: true })
      for (const f of ['aadhaarDocument', 'qualificationDocument']) {
        const docId = doc?.[f]
        if (docId) await payload.delete({ collection: 'teacher-documents', id: docId, overrideAccess: true }).catch(() => undefined)
      }
      await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => undefined)
    }
    const u = await payload.find({ collection: 'users', where: { email: { in: [TEACHER_EMAIL, ADMIN_EMAIL] } }, limit: 5, overrideAccess: true })
    for (const doc of u.docs) await payload.delete({ collection: 'users', id: doc.id, overrideAccess: true }).catch(() => undefined)
  })

  it('requires a teacher login', async () => {
    expect((await meRoute(req(undefined))).status).toBe(401)
    expect((await meRoute(req(studentlessAdminToken))).status).toBe(403)
  })

  it('returns the teacher their own application and status history', async () => {
    const res = await meRoute(req(teacherToken))
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.id).toBe(enquiryId)
    expect(data.status).toBe('under_review')
    expect(data.documents.canUpload).toBe(true)
    expect(data.documents.aadhaar.uploaded).toBe(false)
    expect(data.payment.canPay).toBe(false)
    expect(data.registrationFee.amount).toBe(1000)
    expect(data.history.map((h: any) => h.to)).toContain('under_review')
    // Internal fields never leak.
    expect(JSON.stringify(data)).not.toMatch(/adminNotes|reviewedBy|changeReason/)
  })

  it('uploads and replaces documents, validating type and size', async () => {
    const bad = new FormData()
    bad.set('aadhaarDocument', new File([new Uint8Array([1, 2, 3])], 'x.exe', { type: 'application/x-msdownload' }))
    expect((await docsRoute(req(teacherToken, bad))).status).toBe(400)
    expect((await docsRoute(req(teacherToken, new FormData()))).status).toBe(400)

    const fd = new FormData()
    fd.set('aadhaarDocument', pdf('aadhaar-1.pdf'))
    const ok = await docsRoute(req(teacherToken, fd))
    expect(ok.status).toBe(200)
    const first = (await ok.json()).data
    expect(first.documents.aadhaar).toMatchObject({ uploaded: true, fileName: 'aadhaar-1.pdf' })
    expect(first.documents.qualification.uploaded).toBe(false)

    const fd2 = new FormData()
    fd2.set('aadhaarDocument', pdf('aadhaar-2.pdf'))
    fd2.set('qualificationDocument', pdf('degree.pdf'))
    const second = (await (await docsRoute(req(teacherToken, fd2))).json()).data
    expect(second.documents.aadhaar.fileName).toBe('aadhaar-2.pdf')
    expect(second.documents.qualification.fileName).toBe('degree.pdf')
  })

  it('opens payment only after shortlisting and records the teacher submission', async () => {
    const early = await payRoute(req(teacherToken, { method: 'upi', transactionRef: 'UTR123456' }))
    expect(early.status).toBe(409)

    await payload.update({ collection: 'teacher-enquiries', id: enquiryId, data: { applicationStatus: 'shortlisted' } })
    expect((await (await meRoute(req(teacherToken))).json()).data.payment.canPay).toBe(true)

    expect((await payRoute(req(teacherToken, { method: 'cash', transactionRef: 'UTR123456' }))).status).toBe(400)
    expect((await payRoute(req(teacherToken, { method: 'upi', transactionRef: 'ab' }))).status).toBe(400)

    const ok = await payRoute(req(teacherToken, { method: 'upi', transactionRef: 'UTR123456789' }))
    expect(ok.status).toBe(200)
    const data = (await ok.json()).data
    expect(data.registrationFee).toMatchObject({ status: 'submitted', paymentMethod: 'upi', transactionRef: 'UTR123456789' })

    // Still awaiting verification: approval remains blocked until an admin marks it paid.
    await expect(
      payload.update({ collection: 'teacher-enquiries', id: enquiryId, data: { applicationStatus: 'approved' } }),
    ).rejects.toThrow(/registration fee/i)

    await payload.update({ collection: 'teacher-enquiries', id: enquiryId, data: { registrationFee: { status: 'paid' } } })
    expect((await payRoute(req(teacherToken, { method: 'upi', transactionRef: 'UTR999999999' }))).status).toBe(409)
  })
})
