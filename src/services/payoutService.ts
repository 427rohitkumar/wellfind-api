import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { getRazorpayConfig } from '@/lib/razorpay'
import { extractRelationId } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'
import { findTeacherProfileForUser } from '@/services/teacherAllocationService'

/**
 * Monthly teacher payouts. Every month an allocation was running creates one "due" row
 * (the teacher's share from the allocation); a teacher-payouts record marks it paid.
 */

const ENDED = ['completed', 'cancelled']
const bad = (field: string, message: string) => new ServiceError(message, 400, [{ field, message }])
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/** Months an allocation was teaching: from the month it was accepted/allocated to the month it ended (or now). */
function monthsFor(a: Record<string, any>): string[] {
  const start = new Date(a.allocatedAt)
  if (Number.isNaN(start.getTime())) return []
  let end = new Date()
  if (ENDED.includes(a.status)) {
    const h = (Array.isArray(a.statusHistory) ? a.statusHistory : []).filter((x: any) => ENDED.includes(x.toStatus)).pop()
    const t = h?.changedAt ? new Date(h.changedAt) : null
    if (t && !Number.isNaN(t.getTime())) end = t
  }
  const out: string[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  while (cur <= last && out.length < 36) {
    out.push(monthOf(cur))
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

const BILLABLE = ['accepted', 'active', 'completed', 'cancelled']

async function allocationsFor(payload: Payload, where: Record<string, any>) {
  const res = await (payload as any).find({
    collection: 'teacher-allocations',
    where: { and: [{ status: { in: BILLABLE } }, where] },
    limit: 500,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs as Record<string, any>[]
}

async function paidFor(payload: Payload, allocationIds: number[]) {
  if (allocationIds.length === 0) return new Map<string, Record<string, any>>()
  const res = await (payload as any).find({ collection: 'teacher-payouts', where: { allocation: { in: allocationIds } }, limit: 2000, depth: 0, overrideAccess: true })
  const map = new Map<string, Record<string, any>>()
  for (const p of res.docs as Record<string, any>[]) map.set(`${extractRelationId(p.allocation)}|${p.month}`, p)
  return map
}

function buildRows(
  allocs: Record<string, any>[],
  paid: Map<string, Record<string, any>>,
  onlyMonth?: string,
  teacherPayoutsMap?: Map<number, any>,
) {
  const rows: Record<string, any>[] = []
  for (const a of allocs) {
    const teacher = a.teacher && typeof a.teacher === 'object' ? a.teacher : null
    const student = a.student && typeof a.student === 'object' ? a.student : null
    const teacherId = teacher?.id ?? extractRelationId(a.teacher)
    const payoutSettings = (teacherId && teacherPayoutsMap?.get(teacherId)) || teacher?.payoutSettings || null

    for (const m of monthsFor(a)) {
      if (onlyMonth && m !== onlyMonth) continue
      const p = paid.get(`${a.id}|${m}`)
      rows.push({
        allocationId: a.id,
        teacherId,
        teacherName: teacher?.name ?? null,
        teacherMobile: teacher?.mobile ?? null,
        teacherEmail: teacher?.email ?? null,
        teacherPayoutSettings: payoutSettings,
        studentName: student?.name ?? null,
        studentClass: student?.studentClass ?? null,
        subject: a.subject,
        month: m,
        due: typeof a.teacherPayout === 'number' ? a.teacherPayout : null,
        status: p ? 'paid' : 'pending',
        payoutId: p?.id ?? null,
        amount: p ? p.amount : null,
        paidAt: p?.paidAt ?? null,
        reference: p?.reference ?? null,
        note: p?.note ?? null,
        paymentMethod: p?.paymentMethod ?? 'upi',
        payoutDetails: p?.payoutDetails ?? null,
        utr: p?.utr ?? null,
        razorpayPayoutId: p?.razorpayPayoutId ?? null,
      })
    }
  }
  return rows.sort((x, y) => (y.month as string).localeCompare(x.month as string) || String(x.studentName).localeCompare(String(y.studentName)))
}

const totals = (rows: Record<string, any>[]) => ({
  received: rows.filter((r) => r.status === 'paid').reduce((n, r) => n + (r.amount || 0), 0),
  pending: rows.filter((r) => r.status === 'pending').reduce((n, r) => n + (r.due || 0), 0),
  paidCount: rows.filter((r) => r.status === 'paid').length,
  pendingCount: rows.filter((r) => r.status === 'pending').length,
})

/** The signed-in teacher's own payout history. */
export async function teacherPayoutLedger(payload: Payload, user: AuthUserRecord) {
  const profile = await findTeacherProfileForUser(payload, user.id)
  if (!profile) throw new ServiceError('No teacher profile is linked to this account.', 403)
  const allocs = await allocationsFor(payload, { teacher: { equals: profile.id } })
  const paid = await paidFor(payload, allocs.map((a) => a.id))
  const rows = buildRows(allocs, paid).map(({ teacherId, teacherName, ...r }) => { void teacherId; void teacherName; return r })
  return { rows, totals: totals(rows) }
}

/** Finance view: every teacher's payouts, optionally for one month, with database-backed payout settings. */
export async function adminPayoutLedger(payload: Payload, sp: URLSearchParams) {
  const month = sp.get('month')
  if (month && !isMonth(month)) throw bad('month', 'month must be YYYY-MM.')
  const teacher = Number(sp.get('teacher'))
  const allocs = await allocationsFor(payload, Number.isInteger(teacher) && teacher > 0 ? { teacher: { equals: teacher } } : {})
  const paid = await paidFor(payload, allocs.map((a) => a.id))

  // Collect teacher ids to ensure payoutSettings are fully resolved from DB
  const rawTeacherIds = allocs.map((a) => a.teacher?.id ?? extractRelationId(a.teacher)).filter(Boolean) as number[]
  const teacherIds = [...new Set(rawTeacherIds)]
  const teacherPayoutsMap = new Map<number, any>()

  if (teacherIds.length > 0) {
    // 1. Fetch TeacherProfiles
    const tProfiles = await (payload as any).find({
      collection: 'teacher-profiles',
      where: { id: { in: teacherIds } },
      limit: teacherIds.length,
      depth: 0,
      overrideAccess: true,
    })
    for (const tp of tProfiles.docs as Record<string, any>[]) {
      if (tp.payoutSettings) teacherPayoutsMap.set(tp.id, tp.payoutSettings)
    }

    // 2. For teachers without payoutSettings, query TeacherEnquiries
    const missing = teacherIds.filter((id) => !teacherPayoutsMap.has(id))
    if (missing.length > 0) {
      const tEnqs = await (payload as any).find({
        collection: 'teacher-enquiries',
        where: { teacherProfile: { in: missing } },
        limit: missing.length,
        depth: 0,
        overrideAccess: true,
      })
      for (const te of tEnqs.docs as Record<string, any>[]) {
        const profId = extractRelationId(te.teacherProfile)
        if (profId && te.payoutSettings) teacherPayoutsMap.set(Number(profId), te.payoutSettings)
      }
    }
  }

  const rows = buildRows(allocs, paid, month || undefined, teacherPayoutsMap)
  return { rows, totals: totals(rows) }
}

export async function getTeacherPayoutSettingsById(payload: Payload, teacherId: number) {
  const tp = (await (payload as any).findByID({
    collection: 'teacher-profiles',
    id: teacherId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })) as Record<string, any> | null

  if (tp?.payoutSettings) return tp.payoutSettings

  // Fallback to enquiry
  const enqRes = await (payload as any).find({
    collection: 'teacher-enquiries',
    where: { teacherProfile: { equals: teacherId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const enq = enqRes.docs[0] as Record<string, any> | undefined
  if (enq?.payoutSettings) return enq.payoutSettings

  return { methods: [], primaryId: null }
}

/** The allocation behind an unpaid student-month; throws when that month cannot be paid. */
async function findPayableAllocation(payload: Payload, allocationId: number, month: unknown) {
  if (!Number.isInteger(allocationId) || allocationId <= 0) throw bad('allocationId', 'allocationId is required.')
  if (!isMonth(month)) throw bad('month', 'month must be YYYY-MM.')
  const a = (await (payload as any).findByID({ collection: 'teacher-allocations', id: allocationId, depth: 0, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!a) throw new ServiceError('Allocation not found.', 404)
  if (!monthsFor(a).includes(month)) throw new ServiceError('The student was not allocated to this teacher in that month.', 409)
  const dup = await (payload as any).find({ collection: 'teacher-payouts', where: { and: [{ allocation: { equals: allocationId } }, { month: { equals: month } }] }, limit: 1, depth: 0, overrideAccess: true })
  if (dup.docs.length > 0) throw new ServiceError('This month is already marked as paid for this student.', 409)
  return { allocation: a, month }
}

export async function recordPayout(payload: Payload, admin: AuthUserRecord, body: Record<string, unknown>) {
  const allocationId = Number(body.allocationId)
  const { allocation: a, month } = await findPayableAllocation(payload, allocationId, body.month)
  const amount = body.amount === undefined || body.amount === null || body.amount === '' ? a.teacherPayout : Number(body.amount)
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw bad('amount', 'Enter a valid amount (the allocation has no payout set).')
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date()
  if (Number.isNaN(paidAt.getTime())) throw bad('paidAt', 'Invalid date.')
  const text = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : undefined)

  const created = await (payload as any).create({
    collection: 'teacher-payouts',
    data: {
      allocation: allocationId,
      teacher: extractRelationId(a.teacher),
      month,
      amount,
      paidAt: paidAt.toISOString(),
      reference: text('reference', 120),
      note: text('note', 300),
      paymentMethod: (body.paymentMethod as string) || 'upi',
      payoutDetails: body.payoutDetails || null,
      utr: text('utr', 120) || text('reference', 120),
      razorpayPayoutId: text('razorpayPayoutId', 120),
      recordedBy: admin.id,
    },
    overrideAccess: true,
  })
  const { pushPayoutPaid } = await import('@/services/pushEvents')
  pushPayoutPaid(payload, allocationId, amount, month)
  return { id: created.id, amount, month, paymentMethod: body.paymentMethod || 'upi' }
}

// Razorpay payout statuses after which no money reached the teacher. `processed` is the only success;
// everything else (pending, queued, scheduled, processing, unknown) may still move money.
const NOT_PAID = ['failed', 'reversed', 'rejected', 'cancelled']

type RazorpayXReply = { ok: boolean; status: number; data: any }

/** One RazorpayX call. `status` 0 means no answer was received. */
async function razorpayX(path: string, init: RequestInit, keyId: string, keySecret: string): Promise<RazorpayXReply> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, ...init.headers },
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok && data !== null, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

/** A definite refusal: Razorpay answered and created nothing. Timeouts, conflicts, rate limits and 5xx are not. */
const refused = (r: RazorpayXReply) => r.status >= 400 && r.status < 500 && r.status !== 409 && r.status !== 429

/**
 * Pays a teacher's student-month through RazorpayX (UPI). The month is recorded as paid only when Razorpay
 * reports the payout `processed`. Calling again for the same month checks the existing payout instead of
 * sending money twice. The result is one of:
 *   success          recorded as paid
 *   pending          money may be on its way; do not pay manually, call again later
 *   fallbackToManual Razorpay refused or the payout failed; paying manually is safe
 */
export async function initiateRazorpayPayout(payload: Payload, admin: AuthUserRecord, body: Record<string, any>) {
  const allocationId = Number(body.allocationId)
  const month = String(body.month || '')
  const upiId = String(body.upiId || '').trim()
  const amount = Number(body.amount)

  if (!allocationId || !month) throw bad('allocationId', 'allocationId and month are required.')
  if (!upiId) throw bad('upiId', 'Teacher UPI ID is required for Razorpay UPI payout.')
  if (!Number.isFinite(amount) || amount <= 0) throw bad('amount', 'Valid amount is required.')
  // Validate before any money moves: unknown allocation, wrong month or an already paid month stop here.
  await findPayableAllocation(payload, allocationId, month)

  const cfg = getRazorpayConfig()
  if (!cfg.configured) throw new ServiceError('Razorpay is not configured. Record the payment manually.', 503)
  const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER?.trim()
  if (!accountNumber) {
    throw new ServiceError('Automatic payout is not set up (RAZORPAY_ACCOUNT_NUMBER is missing). Record the payment manually.', 503)
  }

  const teacherName = String(body.teacherName || '').trim().slice(0, 50)
  const contactName = teacherName.length >= 3 ? teacherName : 'Teacher'
  const referenceId = `PO_${allocationId}_${month.replace('-', '')}`

  const pending = (message: string, payout?: any) => ({
    success: false,
    pending: true,
    fallbackToManual: false,
    message,
    payoutStatus: (payout?.status as string | undefined) ?? 'unknown',
    razorpayPayoutId: (payout?.id as string | undefined) ?? null,
  })
  const manual = (message: string) => ({
    success: false,
    pending: false,
    fallbackToManual: true,
    message,
    upiUri: `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(contactName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Wellfind-Payout-${month}`)}`,
  })
  const waiting = (payout: any) =>
    pending(`Razorpay payout is "${payout?.status ?? 'unknown'}". It is not marked paid yet. Check again later and do not pay manually.`, payout)

  /** Records a payout that Razorpay reports as processed, using Razorpay's amount. */
  const confirm = async (payout: any, sentTo?: string) => {
    try {
      const record = await recordPayout(payload, admin, {
        allocationId,
        month,
        amount: typeof payout.amount === 'number' ? payout.amount / 100 : amount,
        paidAt: new Date().toISOString(),
        reference: payout.utr || payout.id,
        paymentMethod: 'razorpay',
        razorpayPayoutId: payout.id,
        utr: payout.utr || payout.id,
        note: 'Razorpay UPI payout (processed)',
        payoutDetails: { upiId: sentTo, razorpayPayoutId: payout.id, status: payout.status },
      })
      return { success: true, pending: false, fallbackToManual: false, payout, record, message: 'Razorpay payout processed and recorded.' }
    } catch (err) {
      payload.logger.error({ err, msg: `Razorpay payout ${payout.id} is processed but was not recorded` })
      return pending('Razorpay has paid this, but saving it failed. Check again to record it and do not pay manually.', payout)
    }
  }

  // 1. What does Razorpay already hold for this student-month?
  const query = new URLSearchParams({ account_number: accountNumber, reference_id: referenceId, count: '100' })
  const lookup = await razorpayX(`/payouts?${query}`, { method: 'GET' }, cfg.keyId!, cfg.keySecret!)
  if (refused(lookup)) return manual(lookup.data?.error?.description || `Razorpay Payouts returned status ${lookup.status}.`)
  if (!lookup.ok || !Array.isArray(lookup.data?.items)) {
    return pending('Could not check this payout with Razorpay, so nothing was sent. Try again before paying manually.')
  }
  const earlier = (lookup.data.items as any[]).filter((p) => p.reference_id === referenceId)
  const live = earlier.find((p) => !NOT_PAID.includes(p.status))
  if (live) return live.status === 'processed' ? confirm(live) : waiting(live)

  // 2. Send a new payout. The same request within the hour reuses the key, so Razorpay cannot pay it twice.
  const attempt = [referenceId, earlier.length, upiId, new Date().toISOString().slice(0, 13)].join('|')
  const created = await razorpayX(
    '/payouts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payout-Idempotency': createHash('sha256').update(attempt).digest('hex').slice(0, 32),
      },
      body: JSON.stringify({
        account_number: accountNumber,
        fund_account: { account_type: 'vpa', vpa: { address: upiId }, contact: { name: contactName, type: 'vendor' } },
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        mode: 'UPI',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: referenceId,
        narration: `Wellfind ${month.replace('-', '')} Payout`, // Razorpay allows letters, digits and spaces only
      }),
    },
    cfg.keyId!,
    cfg.keySecret!,
  )

  if (refused(created)) return manual(created.data?.error?.description || `Razorpay Payouts returned status ${created.status}.`)
  if (!created.ok || !created.data?.id) {
    return pending('Razorpay did not confirm the request, so the payout may or may not exist. Check again before paying manually.')
  }
  if (created.data.status === 'processed') return confirm(created.data, upiId)
  if (NOT_PAID.includes(created.data.status)) {
    return manual(created.data.status_details?.description || `Razorpay payout ${created.data.status}.`)
  }
  return waiting(created.data)
}

export async function undoPayout(payload: Payload, id: number) {
  const doc = await (payload as any).findByID({ collection: 'teacher-payouts', id, depth: 0, disableErrors: true, overrideAccess: true })
  if (!doc) throw new ServiceError('Payout not found.', 404)
  await (payload as any).delete({ collection: 'teacher-payouts', id, overrideAccess: true })
  return { id }
}
