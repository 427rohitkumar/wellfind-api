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

const extraScoresOf = (report: Record<string, any>) =>
  (Array.isArray(report.extraScores) ? report.extraScores : []).map((x: Record<string, any>) => ({ label: x.label as string, score: x.score as number, level: levelOf(x.score) }))

function serializeReport(report: Record<string, any>) {
  const entered = ['iqScore', 'creativityScore', 'academicScore'].some((k) => typeof report[k] === 'number') || extraScoresOf(report).length > 0
  if (!entered) return null
  return {
    iqScore: report.iqScore ?? null,
    creativityScore: report.creativityScore ?? null,
    academicScore: report.academicScore ?? null,
    iqLevel: levelOf(report.iqScore),
    creativityLevel: levelOf(report.creativityScore),
    academicLevel: levelOf(report.academicScore),
    extraScores: extraScoresOf(report),
    strengths: report.strengths ?? null,
    improvementAreas: report.improvementAreas ?? null,
    recommendation: report.recommendation ?? null,
    hoursPerWeek: report.hoursPerWeek ?? null,
    testerNotes: report.testerNotes ?? null,
    reportedAt: report.reportedAt ?? null,
  }
}

export function serializeTest(doc: Record<string, any>) {
  const enquiry = doc.studentEnquiry && typeof doc.studentEnquiry === 'object' ? doc.studentEnquiry : null
  const tester = doc.tester && typeof doc.tester === 'object' ? doc.tester : null
  const report = (doc.report ?? {}) as Record<string, any>
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
    report: serializeReport(report),
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
  const [
    requested,
    awaitingPayment,
    scheduled,
    conducted,
    reportReady,
    onlineCount,
    offlineCount,
    skippedCount,
  ] = await Promise.all([
    count({ status: { equals: 'requested' } }),
    count({ and: [{ 'payment.status': { equals: 'pending' } }, { status: { not_in: ['cancelled', 'report_ready'] } }] }),
    count({ status: { equals: 'scheduled' } }),
    count({ status: { equals: 'conducted' } }),
    count({ status: { equals: 'report_ready' } }),
    count({ and: [{ mode: { equals: 'digital' } }, { status: { not_equals: 'cancelled' } }] }),
    count({ and: [{ mode: { equals: 'physical' } }, { status: { not_equals: 'cancelled' } }] }),
    (payload as any)
      .count({
        collection: 'student-enquiries',
        where: { testSkipped: { equals: true } },
        overrideAccess: true,
      })
      .then((r: any) => r.totalDocs as number),
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
    counts: {
      requested,
      awaitingPayment,
      scheduled,
      conducted,
      reportReady,
      onlineCount,
      offlineCount,
      skippedCount,
    },
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
  if (r.extraScores !== undefined) {
    const list = r.extraScores
    if (!Array.isArray(list) || list.length > 10) throw bad('extraScores', 'Add at most 10 other scores.')
    out.extraScores = list.map((x: any, i) => {
      const label = typeof x?.label === 'string' ? x.label.trim() : ''
      if (!label || label.length > 60) throw bad(`extraScores.${i}.label`, 'Name each score (up to 60 characters).')
      if (typeof x.score !== 'number' || !Number.isFinite(x.score) || x.score < 0 || x.score > 100) throw bad(`extraScores.${i}.score`, `${label} must be a number from 0 to 100.`)
      return { label, score: Math.round(x.score * 10) / 10 }
    })
  }
  return out
}

/** A report can be finished only with the three main scores and guidance for the teacher. */
function finishedReport(r: Record<string, any>) {
  for (const k of ['iqScore', 'creativityScore', 'academicScore']) {
    if (typeof r[k] !== 'number') throw bad(k, 'Enter all three scores before finishing the report.')
  }
  if (!String(r.recommendation || '').trim()) throw bad('recommendation', 'Add guidance for the teacher.')
  return { ...r, reportedAt: new Date().toISOString() }
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

  const nextMode = (data.mode ?? doc.mode) as TestMode
  if (nextMode === 'physical' && (body.report !== undefined || body.status === 'report_ready')) {
    throw new ServiceError('The result of a physical test is entered by the allocated teacher.', 409, [{ field: 'report', message: 'Teacher entry only.' }])
  }

  // Tester, schedule, venue.
  if (body.tester !== undefined) {
    if (body.tester === null) data.tester = null
    else {
      const tid = typeof body.tester === 'number' ? body.tester : parsePositiveIntId(String(body.tester))
      if (!tid) throw bad('tester', 'tester must be a user id.')
      const user = await (payload as any).findByID({ collection: 'users', id: tid, depth: 0, disableErrors: true, overrideAccess: true })
      if (!user || user.status !== 'active') throw bad('tester', 'The tester must be an active user.')
      if (nextMode === 'physical' && user.role !== 'teacher') throw bad('tester', 'A physical test is taken by a teacher. Choose a teacher account.')
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
          const testerId = extractRelationId(merged.tester)
          if (!testerId) throw bad('tester', 'Allocate a teacher for a physical test.')
          const tester = await (payload as any).findByID({ collection: 'users', id: testerId, depth: 0, disableErrors: true, overrideAccess: true })
          if (!tester || tester.role !== 'teacher' || tester.status !== 'active') throw bad('tester', 'A physical test is taken by an active teacher.')
          if (!String(merged.venue || '').trim()) throw bad('venue', 'Add the address where the test will be held.')
        }
      }
      if (next === 'report_ready') data.report = finishedReport((merged.report ?? {}) as Record<string, any>)
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

/* ---------------------------- Allocated teacher ---------------------------- */

/** The teacher sees booked physical tests allocated to them. */
const TEACHER_VISIBLE: TestStatus[] = ['scheduled', 'conducted', 'report_ready']

function serializeForTester(doc: Record<string, any>) {
  const t = serializeTest(doc)
  const open = t.status !== 'report_ready'
  const s = t.student
  return {
    id: t.id,
    mode: t.mode,
    status: t.status,
    scheduledAt: t.scheduledAt,
    venue: t.venue,
    schedulingNote: t.schedulingNote,
    conductedAt: t.conductedAt,
    canEnterResult: open,
    student: s
      ? {
          name: s.name,
          studentClass: s.studentClass,
          subjects: s.subjects,
          locality: s.locality,
          preferredTiming: s.preferredTiming,
          // The phone number is needed only until the result is in.
          phoneNumber: open ? s.phoneNumber : null,
        }
      : null,
    report: t.report,
  }
}

/** Anything not allocated to this teacher looks like "not found". */
async function ownTest(payload: Payload, user: AuthUserRecord, id: number) {
  const doc = await load(payload, id)
  if (extractRelationId(doc.tester) !== user.id || doc.mode !== 'physical' || !TEACHER_VISIBLE.includes(doc.status as TestStatus)) {
    throw new ServiceError('Test not found.', 404)
  }
  return doc
}

export async function listTesterTests(payload: Payload, user: AuthUserRecord) {
  const res = await (payload as any).find({
    collection: 'enquiry-tests',
    where: { and: [{ tester: { equals: user.id } }, { mode: { equals: 'physical' } }, { status: { in: TEACHER_VISIBLE } }] },
    sort: '-scheduledAt',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })
  return { docs: (res.docs as Record<string, any>[]).map(serializeForTester) }
}

export async function getTesterTest(payload: Payload, user: AuthUserRecord, id: number) {
  return serializeForTester(await ownTest(payload, user, id))
}

/**
 * The allocated teacher records the visit: `{ report?, submit? }`. Saving keeps a draft and marks the
 * test conducted; `submit: true` finishes the report, after which it can no longer be changed.
 */
export async function saveTesterResult(payload: Payload, user: AuthUserRecord, id: number, body: Record<string, unknown>) {
  const doc = await ownTest(payload, user, id)
  if (doc.status === 'report_ready') throw new ServiceError('This result is already submitted and can no longer be changed.', 409)
  if (body.submit !== undefined && typeof body.submit !== 'boolean') throw bad('submit', 'submit must be true or false.')
  if (body.report === undefined && body.submit !== true) throw bad('report', 'Enter the result.')

  const report = (body.report === undefined ? (doc.report ?? {}) : parseReport(body.report, doc.report ?? {})) as Record<string, any>
  const status: TestStatus = body.submit === true ? 'report_ready' : 'conducted'
  const data: Record<string, any> = { status, report: body.submit === true ? finishedReport(report) : report }
  if (doc.status === 'scheduled') data.conductedAt = new Date().toISOString()
  if (status !== doc.status) data.history = [...(Array.isArray(doc.history) ? doc.history : []), note(status, user, 'Entered by the allocated teacher')]

  await (payload as any).update({ collection: 'enquiry-tests', id, data, overrideAccess: true })
  return serializeForTester(await load(payload, id))
}

/** Active teachers who can be allocated to take a physical test. */
export async function listTesters(payload: Payload) {
  const res = await (payload as any).find({
    collection: 'users',
    where: { and: [{ status: { equals: 'active' } }, { role: { equals: 'teacher' } }] },
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
