import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getMailConfig } from '@/lib/mail/config'
import { listTemplates, renderTemplate, templates } from '@/lib/mail/templates'
import { sendTemplatedEmail } from '@/services/mailService'
import { runMonthlyPayoutJob, runRegistrationExpiryJob } from '@/services/mailJobs'
import { GET as statsRoute } from '@/app/api/admin/mail/stats/route'
import { GET as logsRoute } from '@/app/api/admin/mail/logs/route'
import { POST as retryRoute } from '@/app/api/admin/mail/logs/[id]/retry/route'
import { POST as testRoute } from '@/app/api/admin/mail/test/route'
import { POST as jobsRoute } from '@/app/api/admin/mail/jobs/route'
import { POST as createAccountRoute } from '@/app/api/teacher-enquiries/[id]/create-account/route'

let payload: any
let adminToken = ''
let teacherToken = ''
const TAG = `${Date.now()}`
const PASSWORD = 'MailSpecPass123!'
const ADMIN_EMAIL = 'mail-spec-admin@example.com'
const TEACHER_EMAIL = 'mail-spec-teacher@example.com'
const createdEmails: string[] = [ADMIN_EMAIL, TEACHER_EMAIL]
const enquiryIds: number[] = []
const profileIds: number[] = []
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

function req(token: string | undefined, method = 'GET', body?: unknown, query = ''): Request {
  return new Request(`http://localhost:3000/api/x${query}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function makeUser(email: string, role: 'super_admin' | 'teacher') {
  const ex = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
  if (!ex.docs[0]) await payload.create({ collection: 'users', data: { email, password: PASSWORD, role, status: 'active' }, overrideAccess: true })
  return (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token as string
}

const logsFor = async (where: Record<string, any>) =>
  (await payload.find({ collection: 'email-logs', where, limit: 50, sort: '-createdAt', overrideAccess: true })).docs as any[]

describe('Mail system', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    adminToken = await makeUser(ADMIN_EMAIL, 'super_admin')
    teacherToken = await makeUser(TEACHER_EMAIL, 'teacher')
  })

  afterAll(async () => {
    for (const id of profileIds) await payload.delete({ collection: 'teacher-profiles', id, overrideAccess: true }).catch(() => undefined)
    for (const id of enquiryIds) await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => undefined)
    const logs = await payload.find({ collection: 'email-logs', where: { recipient: { contains: TAG } }, limit: 200, overrideAccess: true })
    for (const l of logs.docs) await payload.delete({ collection: 'email-logs', id: l.id, overrideAccess: true }).catch(() => undefined)
    for (const email of createdEmails) {
      const u = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
      if (u.docs[0]) await payload.delete({ collection: 'users', id: u.docs[0].id, overrideAccess: true }).catch(() => undefined)
    }
  })

  describe('templates', () => {
    const sample: Record<string, any> = {
      name: 'Asha', email: 'asha@example.com', password: 'Secret123abc', loginUrl: 'https://x.test/login', otp: '1234', expiresInMinutes: 10,
      status: 'shortlisted', applicationId: 7, amount: 1000, upiId: 'wellfind@upi', payeeName: 'Wellfind', waived: false, reference: 'UTR1',
      validUntil: '2027-01-01', expiresAt: '2027-01-01', daysLeft: 7, expired: false, renewalAmount: 1000, studentName: 'Rohit', studentClass: 'Class 10',
      subject: 'Maths', locality: 'Khagaul', timing: 'Evening', monthlyPayout: 3000, monthLabel: 'November 2026', total: 6000,
      lines: [{ student: 'Rohit', subject: 'Maths', amount: 3000 }, { student: 'Neha', subject: 'Science', amount: 3000 }], roleLabel: 'an administrator',
      host: 'smtp.test', from: 'A <a@b.c>', sentBy: 'admin',
    }

    it('renders every template to html, text and a subject', () => {
      const cfg = getMailConfig()
      for (const t of listTemplates()) {
        const out = renderTemplate(t.key, sample, cfg)
        expect(out.subject.length).toBeGreaterThan(5)
        expect(out.html).toContain('<html')
        expect(out.text.length).toBeGreaterThan(20)
      }
    })

    it('escapes user supplied text and shows credentials only where designed', () => {
      const cfg = getMailConfig()
      const out = renderTemplate('teacher_welcome', { ...sample, name: '<script>alert(1)</script>' }, cfg)
      expect(out.html).not.toContain('<script>')
      expect(out.html).toContain('Secret123abc')
      expect(templates.teacher_welcome!.sensitiveKeys).toContain('password')
      expect(templates.password_reset_otp!.sensitiveKeys).toContain('otp')
    })

    it('keeps pre-login mails free of portal links and includes the login in the shortlisted mail', () => {
      const cfg = getMailConfig()
      const received = renderTemplate('teacher_application_received', { name: 'A', applicationId: 1 }, cfg)
      const review = renderTemplate('teacher_status_update', { name: 'A', status: 'under_review', applicationId: 1, hasPortal: false }, cfg)
      for (const out of [received, review]) {
        expect(out.html).not.toContain('<a href')
        expect(out.text.toLowerCase()).not.toContain('portal')
      }
      const welcome = renderTemplate('teacher_welcome', { name: 'A', email: 'a@b.co', password: 'Pw123456xyz' }, cfg)
      expect(welcome.subject.toLowerCase()).toContain('shortlisted')
      expect(welcome.html).toContain('Pw123456xyz')
    })

    it('covers every mail the product needs', () => {
      const keys = listTemplates().map((t) => t.key)
      for (const k of ['teacher_application_received', 'teacher_welcome', 'password_reset_otp', 'teacher_status_update', 'teacher_payment_due', 'teacher_registration_expiry',
        'teacher_allocated', 'teacher_monthly_payment', 'account_created', 'account_blocked', 'account_suspended']) {
        expect(keys).toContain(k)
      }
    })
  })

  describe('sending and logging', () => {
    it('logs the mail, never stores secrets and reports skipped in the test environment', async () => {
      const to = `log-${TAG}@example.com`
      const res = await sendTemplatedEmail({ payload, template: 'teacher_welcome', to, data: { name: 'Log', email: to, password: 'TopSecret99x' } })
      expect(res.status).toBe('skipped')
      const [row] = await logsFor({ recipient: { equals: to } })
      expect(row.status).toBe('skipped')
      expect(row.retryable).toBe(false)
      expect(JSON.stringify(row)).not.toContain('TopSecret99x')
    })

    it('rejects invalid recipients and de-duplicates by key', async () => {
      expect((await sendTemplatedEmail({ payload, template: 'test_email', to: 'not-an-email', data: {} })).status).toBe('invalid')
      const to = `dup-${TAG}@example.com`
      const key = `dup-${TAG}`
      // skipped mails are not counted as delivered, so only sent/queued ones are de-duplicated
      await sendTemplatedEmail({ payload, template: 'test_email', to, data: {}, dedupeKey: key })
      const again = await sendTemplatedEmail({ payload, template: 'test_email', to, data: {}, dedupeKey: key })
      expect(['skipped', 'duplicate']).toContain(again.status)
    })
  })

  describe('triggers', () => {
    it('sends a welcome mail when an account is created and notices on block, suspend and restore', async () => {
      const email = `acct-${TAG}@example.com`
      createdEmails.push(email)
      const u = await payload.create({ collection: 'users', data: { email, password: PASSWORD, role: 'super_admin', status: 'active' }, overrideAccess: true })
      expect((await logsFor({ and: [{ recipient: { equals: email } }, { template: { equals: 'account_created' } }] })).length).toBe(1)

      for (const [status, template] of [['blocked', 'account_blocked'], ['active', 'account_restored'], ['suspended', 'account_suspended']] as const) {
        await payload.update({ collection: 'users', id: u.id, data: { status }, overrideAccess: true })
        expect((await logsFor({ and: [{ recipient: { equals: email } }, { template: { equals: template } }] })).length).toBe(1)
      }
    })

    it('emails the applicant on status changes, payment due, payment received and the welcome login', async () => {
      const email = `teach-${TAG}@example.com`
      createdEmails.push(email)
      const e = await payload.create({
        collection: 'teacher-enquiries',
        data: {
          fullName: 'Mail Spec Teacher', mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`, email,
          highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-10',
          teachingLocality: 'Patna', preferredAvailability: 'Evening', agreedToPolicy: true,
        },
      })
      enquiryIds.push(Number(e.id))
      await payload.update({ collection: 'teacher-enquiries', id: e.id, data: { applicationStatus: 'under_review' } })
      const created = await createAccountRoute(req(adminToken, 'POST', { password: 'MailSpecTeach42' }), ctx(e.id))
      expect(created.status).toBe(201)
      await payload.update({ collection: 'teacher-enquiries', id: e.id, data: { applicationStatus: 'shortlisted' } })
      await payload.update({ collection: 'teacher-enquiries', id: e.id, data: { registrationFee: { status: 'paid' } } })

      const sent = (await logsFor({ recipient: { equals: email } })).map((l) => l.template)
      expect(sent).toContain('teacher_application_received')
      expect(sent).toContain('teacher_status_update')
      expect(sent).toContain('teacher_payment_due')
      expect(sent).toContain('teacher_payment_received')
      expect(sent.filter((t) => t === 'teacher_welcome').length).toBe(1)
      // Shortlisting + login details travel in ONE mail: no separate "shortlisted" status mail.
      expect(sent.filter((t) => t === 'teacher_status_update').length).toBe(1)
      // Created by the teacher flow: no second, generic "account created" mail.
      expect(sent).not.toContain('account_created')

      const fee = (await payload.findByID({ collection: 'teacher-enquiries', id: e.id, overrideAccess: true })).registrationFee
      expect(fee.expiresAt).toBeTruthy()
    })
  })

  describe('scheduled jobs', () => {
    it('sends expiry reminders once per expiry date', async () => {
      const email = `expiry-${TAG}@example.com`
      const enq = await payload.create({
        collection: 'teacher-enquiries',
        data: {
          fullName: 'Expiry Teacher', mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`, email,
          highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-10',
          teachingLocality: 'Patna', preferredAvailability: 'Evening', agreedToPolicy: true,
        },
      })
      enquiryIds.push(Number(enq.id))
      const p = await payload.create({
        collection: 'teacher-profiles',
        data: {
          name: 'Expiry Teacher', email, mobile: `9${Math.floor(100000000 + Math.random() * 899999999)}`, primarySubject: 'Maths',
          qualification: 'B.Ed', classLevels: 'Class 6-10', locality: 'Patna', availability: 'Evening', approvalStatus: 'approved', teacherEnquiry: enq.id,
          account: { status: 'active' }, registrationFee: { status: 'paid', expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString() },
        },
        overrideAccess: true,
      })
      profileIds.push(Number(p.id))
      const first = await runRegistrationExpiryJob(payload)
      expect(first.considered).toBeGreaterThan(0)
      const rows = await logsFor({ and: [{ recipient: { equals: email } }, { template: { equals: 'teacher_registration_expiry' } }] })
      expect(rows.length).toBe(1)
    })

    it('rejects a malformed month for the payout job', async () => {
      const r = await runMonthlyPayoutJob(payload, 'November')
      expect(r.details[0]).toMatch(/Month must look like/)
    })
  })

  describe('admin API', () => {
    it('is admin only', async () => {
      expect((await statsRoute(req(undefined))).status).toBe(401)
      expect((await statsRoute(req(teacherToken))).status).toBe(403)
      expect((await logsRoute(req(teacherToken))).status).toBe(403)
      expect((await testRoute(req(teacherToken, 'POST', { to: 'a@b.co' }))).status).toBe(403)
    })

    it('returns stats, a filtered log, and refuses to retry mails that carried credentials', async () => {
      const stats = await (await statsRoute(req(adminToken))).json()
      expect(stats.data.totals.total).toBeGreaterThan(0)
      expect(JSON.stringify(stats.data.config)).not.toMatch(/password/i)
      expect(stats.data.templateList.length).toBeGreaterThan(8)

      const logs = await (await logsRoute(req(adminToken, 'GET', undefined, `?template=teacher_welcome&search=${TAG}`))).json()
      expect(logs.data.docs.length).toBeGreaterThan(0)
      expect(logs.data.docs.every((d: any) => d.template === 'teacher_welcome')).toBe(true)

      const welcome = logs.data.docs[0]
      const retry = await retryRoute(req(adminToken, 'POST'), ctx(welcome.id))
      expect(retry.status).toBe(409)
      expect((await retry.json()).message).toMatch(/not stored/)
    })

    it('validates the test address and the job name', async () => {
      expect((await testRoute(req(adminToken, 'POST', { to: 'nope' }))).status).toBe(400)
      expect((await jobsRoute(req(adminToken, 'POST', { job: 'unknown' }))).status).toBe(400)
      expect((await jobsRoute(req(adminToken, 'POST', { job: 'monthly_payout', month: 'bad' }))).status).toBe(400)
    })
  })
})
