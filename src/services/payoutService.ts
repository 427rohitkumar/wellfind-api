import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
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

function buildRows(allocs: Record<string, any>[], paid: Map<string, Record<string, any>>, onlyMonth?: string) {
  const rows: Record<string, any>[] = []
  for (const a of allocs) {
    const teacher = a.teacher && typeof a.teacher === 'object' ? a.teacher : null
    const student = a.student && typeof a.student === 'object' ? a.student : null
    for (const m of monthsFor(a)) {
      if (onlyMonth && m !== onlyMonth) continue
      const p = paid.get(`${a.id}|${m}`)
      rows.push({
        allocationId: a.id,
        teacherId: teacher?.id ?? extractRelationId(a.teacher),
        teacherName: teacher?.name ?? null,
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

/** Finance view: every teacher's payouts, optionally for one month. */
export async function adminPayoutLedger(payload: Payload, sp: URLSearchParams) {
  const month = sp.get('month')
  if (month && !isMonth(month)) throw bad('month', 'month must be YYYY-MM.')
  const teacher = Number(sp.get('teacher'))
  const allocs = await allocationsFor(payload, Number.isInteger(teacher) && teacher > 0 ? { teacher: { equals: teacher } } : {})
  const paid = await paidFor(payload, allocs.map((a) => a.id))
  const rows = buildRows(allocs, paid, month || undefined)
  return { rows, totals: totals(rows) }
}

export async function recordPayout(payload: Payload, admin: AuthUserRecord, body: Record<string, unknown>) {
  const allocationId = Number(body.allocationId)
  if (!Number.isInteger(allocationId) || allocationId <= 0) throw bad('allocationId', 'allocationId is required.')
  if (!isMonth(body.month)) throw bad('month', 'month must be YYYY-MM.')
  const a = (await (payload as any).findByID({ collection: 'teacher-allocations', id: allocationId, depth: 0, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!a) throw new ServiceError('Allocation not found.', 404)
  if (!monthsFor(a).includes(body.month)) throw new ServiceError('The student was not allocated to this teacher in that month.', 409)
  const amount = body.amount === undefined || body.amount === null || body.amount === '' ? a.teacherPayout : Number(body.amount)
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw bad('amount', 'Enter a valid amount (the allocation has no payout set).')
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date()
  if (Number.isNaN(paidAt.getTime())) throw bad('paidAt', 'Invalid date.')
  const dup = await (payload as any).find({ collection: 'teacher-payouts', where: { and: [{ allocation: { equals: allocationId } }, { month: { equals: body.month } }] }, limit: 1, depth: 0, overrideAccess: true })
  if (dup.docs.length > 0) throw new ServiceError('This month is already marked as paid for this student.', 409)
  const text = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : undefined)
  const created = await (payload as any).create({
    collection: 'teacher-payouts',
    data: { allocation: allocationId, teacher: extractRelationId(a.teacher), month: body.month, amount, paidAt: paidAt.toISOString(), reference: text('reference', 120), note: text('note', 300), recordedBy: admin.id },
    overrideAccess: true,
  })
  const { pushPayoutPaid } = await import('@/services/pushEvents')
  pushPayoutPaid(payload, allocationId, amount, body.month)
  return { id: created.id, amount, month: body.month }
}

export async function undoPayout(payload: Payload, id: number) {
  const doc = await (payload as any).findByID({ collection: 'teacher-payouts', id, depth: 0, disableErrors: true, overrideAccess: true })
  if (!doc) throw new ServiceError('Payout not found.', 404)
  await (payload as any).delete({ collection: 'teacher-payouts', id, overrideAccess: true })
  return { id }
}
