import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { testModes, testPaymentStatuses, testStatuses, type TestMode, type TestStatus } from '@/collections/EnquiryTests'
import { extractRelationId, extractSubjectNames, parsePaginationParams, parsePositiveIntId } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'

export function getTestFees(): Record<TestMode, number> {
  const n = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
  return { physical: n(process.env.TEST_FEE_PHYSICAL, 99), digital: n(process.env.TEST_FEE_DIGITAL, 49) }
}

/** Allowed forward moves of the test itself. Payment is tracked separately. */
const TRANSITIONS: Record<TestStatus, readonly TestStatus[]> = {
  requested: ['scheduled', 'cancelled'],
  scheduled: ['conducted', 'requested', 'cancelled'],
  conducted: ['report_ready', 'cancelled'],
  report_ready: [],
  cancelled: [],
}

/** A student can ask for the test from the moment their details are verified. */
const ENQUIRY_STATUSES_FOR_TEST = ['in_progress', 'test']

export function levelOf(score: unknown): 'excellent' | 'good' | 'average' | 'needs_support' | null {
  if (typeof score !== 'number') return null
  return score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'average' : 'needs_support'
}

const bad = (field: string, message: string) => new ServiceError(message, 400, [{ field, message }])

export function serializeTest(doc: Record<string, any>) {
  const enquiry = doc.studentEnquiry && typeof doc.studentEnquiry === 'object' ? doc.studentEnquiry : null
  const tester = doc.tester && typeof doc.tester === 'object' ? doc.tester : null
  const report = (doc.report ?? {}) as Record<string, any>
  const hasReport = typeof report.iqScore === 'number' || typeof report.academicScore === 'number' || typeof report.creativityScore === 'number'
  return {
    id: doc.id,
    mode: doc.mode,
    fee: doc.fee,
    status: doc.status,
    payment: {
      status: doc.payment?.status ?? 'pending',
      paidAt: doc.payment?.paidAt ?? null,
      reference: doc.payment?.reference ?? null,
      note: doc.payment?.note ?? null,
    },
    studentEnquiryId: extractRelationId(doc.studentEnquiry),
    student: enquiry
      ? {
          id: enquiry.id,
          name: enquiry.name,
          phoneNumber: enquiry.phoneNumber,
          studentClass: enquiry.studentClass,
          subjects: extractSubjectNames(enquiry.subjects),
          locality: enquiry.locality,
          preferredTiming: enquiry.preferredTiming,
          enquiryStatus: enquiry.enquiryStatus,
        }
      : null,
    tester: tester ? { id: tester.id, email: tester.email, role: tester.role } : doc.tester ? { id: doc.tester } : null,
    scheduledAt: doc.scheduledAt ?? null,
    venue: doc.venue ?? null,
    schedulingNote: doc.schedulingNote ?? null,
    conductedAt: doc.conductedAt ?? null,
    report: hasReport
      ? {
          iqScore: report.iqScore ?? null,
          creativityScore: report.creativityScore ?? null,
          academicScore: report.academicScore ?? null,
          iqLevel: levelOf(report.iqScore),
          creativityLevel: levelOf(report.creativityScore),
          academicLevel: levelOf(report.academicScore),
          strengths: report.strengths ?? null,
          improvementAreas: report.improvementAreas ?? null,
          recommendation: report.recommendation ?? null,
          hoursPerWeek: report.hoursPerWeek ?? null,
          testerNotes: report.testerNotes ?? null,
          reportedAt: report.reportedAt ?? null,
        }
      : null,
    history: Array.isArray(doc.history) ? doc.history.map((h: Record<string, any>) => ({ type: h.type, at: h.at, note: h.note ?? null })) : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function load(payload: Payload, id: number) {
  const doc = await (payload as any).findByID({ collection: 'enquiry-tests', id, depth: 1, disableErrors: true, overrideAccess: true })
  if (!doc) throw new ServiceError('Test not found.', 404)
  return doc as Record<string, any>
}

const note = (type: string, admin: AuthUserRecord, text?: string) => ({ type, at: new Date().toISOString(), by: admin.id, ...(text ? { note: text.slice(0, 290) } : {}) })

export async function listTests(payload: Payload, sp: URLSearchParams) {
  const { page, limit } = parsePaginationParams(sp)
  const and: Record<string, any>[] = []
  const status = sp.get('status')
  if (status && (testStatuses as readonly string[]).includes(status)) and.push({ status: { equals: status } })
  const mode = sp.get('mode')
  if (mode && (testModes as readonly string[]).includes(mode)) and.push({ mode: { equals: mode } })
  const pay = sp.get('payment')
  if (pay && (testPaymentStatuses as readonly string[]).includes(pay)) and.push({ 'payment.status': { equals: pay } })
  const enquiry = parsePositiveIntId(sp.get('enquiry') ?? '')
  if (enquiry) and.push({ studentEnquiry: { equals: enquiry } })
  const search = sp.get('search')?.trim()
  if (search) {
    const found = await (payload as any).find({
      collection: 'student-enquiries',
      where: { or: [{ name: { contains: search } }, { phoneNumber: { contains: search } }] },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    and.push({ studentEnquiry: { in: found.docs.map((d: any) => d.id) } })
  }
  const res = await (payload as any).find({
    collection: 'enquiry-tests',
    where: and.length ? { and } : {},
    sort: '-createdAt',
    page,
    limit,
    depth: 1,
    overrideAccess: true,
  })

  const count = (where: Record<string, any>) =>
    (payload as any).count({ collection: 'enquiry-tests', where, overrideAccess: true }).then((r: any) => r.totalDocs as number)
  const [requested, awaitingPayment, scheduled, conducted, reportReady] = await Promise.all([
    count({ status: { equals: 'requested' } }),
    count({ and: [{ 'payment.status': { equals: 'pending' } }, { status: { not_in: ['cancelled', 'report_ready'] } }] }),
    count({ status: { equals: 'scheduled' } }),
    count({ status: { equals: 'conducted' } }),
    count({ status: { equals: 'report_ready' } }),
  ])

  return {
    docs: (res.docs as Record<string, any>[]).map(serializeTest),
    totalDocs: res.totalDocs,
    totalPages: res.totalPages,
    page: res.page,
    limit: res.limit,
    hasNextPage: res.hasNextPage,
    hasPrevPage: res.hasPrevPage,
    fees: getTestFees(),
    counts: { requested, awaitingPayment, scheduled, conducted, reportReady },
  }
}

export async function getTest(payload: Payload, id: number) {
  return { ...serializeTest(await load(payload, id)), fees: getTestFees() }
}

/** Starts a test for an enquiry. The enquiry moves to the `test` status. */
export async function createTest(payload: Payload, body: Record<string, unknown>, admin: AuthUserRecord) {
  const enquiryId = typeof body.studentEnquiryId === 'number' ? body.studentEnquiryId : parsePositiveIntId(String(body.studentEnquiryId ?? ''))
  if (!enquiryId) throw bad('studentEnquiryId', 'studentEnquiryId is required.')
  const mode = body.mode
  if (typeof mode !== 'string' || !(testModes as readonly string[]).includes(mode)) throw bad('mode', "mode must be 'physical' or 'digital'.")

  const enquiry = (await (payload as any).findByID({ collection: 'student-enquiries', id: enquiryId, depth: 0, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!enquiry) throw new ServiceError('Student enquiry not found.', 404)
  if (!ENQUIRY_STATUSES_FOR_TEST.includes(String(enquiry.enquiryStatus))) {
    throw new ServiceError('The test can be requested once the enquiry is verified (In Progress).', 409, [{ field: 'studentEnquiryId', message: `Enquiry is "${enquiry.enquiryStatus}".` }])
  }
  const existing = await (payload as any).find({
    collection: 'enquiry-tests',
    where: { and: [{ studentEnquiry: { equals: enquiryId } }, { status: { not_equals: 'cancelled' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) throw new ServiceError('This student already has an active test.', 409)

  const created = await (payload as any).create({
    collection: 'enquiry-tests',
    data: {
      studentEnquiry: enquiryId,
      mode,
      fee: getTestFees()[mode as TestMode],
      status: 'requested',
      payment: { status: 'pending' },
      history: [note('requested', admin, `${mode} test requested`)],
      createdBy: admin.id,
    },
    overrideAccess: true,
  })

  await (payload as any).update({
    collection: 'student-enquiries',
    id: enquiryId,
    data: { enquiryStatus: 'test', testMode: mode },
    overrideAccess: true,
    context: { skipMail: true },
  })
  return getTest(payload, created.id)
}

function parseReport(raw: unknown, existing: Record<string, any>) {
  if (!raw || typeof raw !== 'object') throw bad('report', 'report must be an object.')
  const r = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...existing }
  for (const k of ['iqScore', 'creativityScore', 'academicScore'] as const) {
    if (r[k] === undefined) continue
    const v = r[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw bad(k, `${k} must be a number from 0 to 100.`)
    out[k] = Math.round(v * 10) / 10
  }
  for (const k of ['strengths', 'improvementAreas', 'recommendation', 'testerNotes'] as const) {
    if (r[k] === undefined) continue
    if (typeof r[k] !== 'string' || (r[k] as string).length > 2000) throw bad(k, `${k} must be text of at most 2000 characters.`)
    out[k] = (r[k] as string).trim()
  }
  if (r.hoursPerWeek !== undefined) {
    const h = r.hoursPerWeek
    if (h !== null && (typeof h !== 'number' || h < 0 || h > 40)) throw bad('hoursPerWeek', 'hoursPerWeek must be between 0 and 40.')
    out.hoursPerWeek = h
  }
  return out
}

/** One update endpoint for everything an admin does on a test; each step is validated server-side. */
export async function updateTest(payload: Payload, id: number, body: Record<string, unknown>, admin: AuthUserRecord) {
  const doc = await load(payload, id)
  const current = doc.status as TestStatus
  const data: Record<string, any> = {}
  const events: ReturnType<typeof note>[] = []

  if (current === 'report_ready' || current === 'cancelled') {
    throw new ServiceError(`A ${current.replace('_', ' ')} test can no longer be changed.`, 409)
  }

  // Mode can change only before anything is paid.
  if (body.mode !== undefined) {
    if (typeof body.mode !== 'string' || !(testModes as readonly string[]).includes(body.mode)) throw bad('mode', "mode must be 'physical' or 'digital'.")
    if (body.mode !== doc.mode) {
      if (current !== 'requested' || (doc.payment?.status && doc.payment.status !== 'pending')) {
        throw new ServiceError('The mode cannot be changed after payment or scheduling.', 409)
      }
      data.mode = body.mode
      data.fee = getTestFees()[body.mode as TestMode]
      events.push(note('mode_changed', admin, `Changed to ${body.mode}`))
    }
  }

  // Payment (status tracking only: the online payment process is added later).
  if (body.paymentStatus !== undefined) {
    if (typeof body.paymentStatus !== 'string' || !(testPaymentStatuses as readonly string[]).includes(body.paymentStatus)) throw bad('paymentStatus', 'Invalid payment status.')
    data.payment = {
      ...(doc.payment ?? {}),
      status: body.paymentStatus,
      paidAt: body.paymentStatus === 'paid' ? new Date().toISOString() : null,
      ...(typeof body.paymentReference === 'string' ? { reference: body.paymentReference.trim().slice(0, 120) } : {}),
      ...(typeof body.paymentNote === 'string' ? { note: body.paymentNote.trim().slice(0, 300) } : {}),
    }
    events.push(note(`payment_${body.paymentStatus}`, admin))
  }

  // Tester, schedule, venue.
  if (body.tester !== undefined) {
    if (body.tester === null) data.tester = null
    else {
      const tid = typeof body.tester === 'number' ? body.tester : parsePositiveIntId(String(body.tester))
      if (!tid) throw bad('tester', 'tester must be a user id.')
      const user = await (payload as any).findByID({ collection: 'users', id: tid, depth: 0, disableErrors: true, overrideAccess: true })
      if (!user || user.status !== 'active') throw bad('tester', 'The tester must be an active user.')
      data.tester = tid
      events.push(note('tester_assigned', admin, user.email))
    }
  }
  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt === null) data.scheduledAt = null
    else if (typeof body.scheduledAt !== 'string' || Number.isNaN(Date.parse(body.scheduledAt))) throw bad('scheduledAt', 'scheduledAt must be a valid date and time.')
    else data.scheduledAt = new Date(body.scheduledAt).toISOString()
  }
  for (const k of ['venue', 'schedulingNote'] as const) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== 'string' || (body[k] as string).length > (k === 'venue' ? 500 : 1000)) throw bad(k, `${k} is too long.`)
      data[k] = (body[k] as string).trim()
    }
  }
  if (body.report !== undefined) data.report = parseReport(body.report, doc.report ?? {})

  // Status move.
  if (body.status !== undefined) {
    const next = body.status as TestStatus
    if (typeof body.status !== 'string' || !(testStatuses as readonly string[]).includes(next)) throw bad('status', 'Invalid status.')
    if (next !== current) {
      if (!TRANSITIONS[current].includes(next)) throw new ServiceError(`Cannot move a test from "${current}" to "${next}".`, 409)
      const merged = { ...doc, ...data }
      const mode = merged.mode as TestMode
      const payOk = ['paid', 'waived'].includes(merged.payment?.status)
      if (next === 'scheduled') {
        if (!payOk) throw new ServiceError('Payment must be paid or waived before the test is scheduled.', 409, [{ field: 'paymentStatus', message: 'Payment is pending.' }])
        if (!merged.scheduledAt) throw bad('scheduledAt', 'Choose a date and time.')
        if (mode === 'physical') {
          if (!extractRelationId(merged.tester)) throw bad('tester', 'Allocate a tester for a physical test.')
          if (!String(merged.venue || '').trim()) throw bad('venue', 'Add the address where the test will be held.')
        }
      }
      if (next === 'report_ready') {
        const r = (merged.report ?? {}) as Record<string, any>
        for (const k of ['iqScore', 'creativityScore', 'academicScore']) {
          if (typeof r[k] !== 'number') throw bad(k, 'Enter all three scores before finishing the report.')
        }
        if (!String(r.recommendation || '').trim()) throw bad('recommendation', 'Add guidance for the teacher.')
        data.report = { ...r, reportedAt: new Date().toISOString() }
      }
      if (next === 'conducted') data.conductedAt = new Date().toISOString()
      data.status = next
      events.push(note(next, admin))
    }
  }

  if (Object.keys(data).length === 0) throw bad('body', 'Nothing to update.')
  if (events.length) data.history = [...(Array.isArray(doc.history) ? doc.history : []), ...events]

  await (payload as any).update({ collection: 'enquiry-tests', id, data, overrideAccess: true })

  // Keep the enquiry's own test summary in step for its detail page.
  const enquiryId = extractRelationId(doc.studentEnquiry)
  if (enquiryId && (data.scheduledAt !== undefined || data.venue !== undefined)) {
    await (payload as any).update({
      collection: 'student-enquiries',
      id: enquiryId,
      data: { ...(data.scheduledAt !== undefined ? { testScheduledAt: data.scheduledAt } : {}), ...(data.venue !== undefined ? { testVenue: data.venue } : {}) },
      overrideAccess: true,
      context: { skipMail: true },
    })
  }
  return getTest(payload, id)
}

/** Active people who can conduct a test (administrators and teachers). */
export async function listTesters(payload: Payload) {
  const res = await (payload as any).find({
    collection: 'users',
    where: { and: [{ status: { equals: 'active' } }, { role: { in: ['super_admin', 'teacher', 'operations_manager', 'student_counselor'] } }] },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const users = res.docs as Record<string, any>[]
  const profiles = await (payload as any).find({
    collection: 'teacher-profiles',
    where: { user: { in: users.map((u) => u.id) } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const nameByUser = new Map<number, string>()
  for (const p of profiles.docs as Record<string, any>[]) {
    const uid = extractRelationId(p.user)
    if (typeof uid === 'number') nameByUser.set(uid, p.name)
  }
  return users.map((u) => ({ id: u.id, email: u.email, role: u.role, name: nameByUser.get(u.id) || String(u.email).split('@')[0] }))
}
