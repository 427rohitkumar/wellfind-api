import type { Payload } from 'payload'
import { getMailConfig } from '@/lib/mail/config'
import { sendTemplatedEmail } from '@/services/mailService'

const DAY = 86_400_000

export interface JobResult {
  job: string
  considered: number
  sent: number
  skipped: number
  failed: number
  duplicates: number
  details: string[]
}

const emptyResult = (job: string): JobResult => ({ job, considered: 0, sent: 0, skipped: 0, failed: 0, duplicates: 0, details: [] })

function tally(result: JobResult, status: string) {
  if (status === 'sent') result.sent += 1
  else if (status === 'duplicate') result.duplicates += 1
  else if (status === 'skipped') result.skipped += 1
  else result.failed += 1
}

/**
 * Reminds teachers whose registration is about to expire (default 30 and 7 days before)
 * and once when it has expired. Each reminder is sent at most once per expiry date.
 */
export async function runRegistrationExpiryJob(payload: Payload): Promise<JobResult> {
  const cfg = getMailConfig()
  const result = emptyResult('registration_expiry')
  const horizon = Math.max(...cfg.expiryReminderDays, 0)
  const now = Date.now()

  const profiles = await (payload as any).find({
    collection: 'teacher-profiles',
    where: { 'registrationFee.expiresAt': { less_than: new Date(now + horizon * DAY).toISOString() } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  for (const profile of profiles.docs as Record<string, any>[]) {
    const expiresAt = profile.registrationFee?.expiresAt
    if (!expiresAt || !profile.email) continue
    result.considered += 1
    const msLeft = new Date(expiresAt).getTime() - now
    const daysLeft = Math.ceil(msLeft / DAY)
    const expired = msLeft <= 0
    // The tightest reminder window that applies (e.g. 7 days beats 30 days).
    const window = expired ? 0 : [...cfg.expiryReminderDays].sort((a, b) => a - b).find((d) => daysLeft <= d)
    if (window === undefined) continue

    const outcome = await sendTemplatedEmail({
      payload,
      template: 'teacher_registration_expiry',
      to: profile.email,
      toName: profile.name,
      data: { name: profile.name, expiresAt, daysLeft: Math.max(daysLeft, 0), expired, renewalAmount: cfg.registrationFeeAmount },
      relatedType: 'teacher-profile',
      relatedId: profile.id,
      dedupeKey: `expiry:${profile.id}:${String(expiresAt).slice(0, 10)}:${window}`,
    })
    tally(result, outcome.status)
    if (outcome.error && outcome.status !== 'duplicate') result.details.push(`${profile.email}: ${outcome.error}`)
  }
  return result
}

/**
 * Sends each teacher their payout summary for a month (`YYYY-MM`) from the commercial terms
 * of their live allocations. Triggered by an admin, never automatically, because it states amounts.
 */
export async function runMonthlyPayoutJob(payload: Payload, month: string): Promise<JobResult> {
  const result = emptyResult('monthly_payout')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    result.details.push('Month must look like 2026-11.')
    return result
  }
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const allocations = await (payload as any).find({
    collection: 'teacher-allocations',
    where: { status: { in: ['accepted', 'active'] } },
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })

  const byTeacher = new Map<number | string, { teacher: Record<string, any>; lines: { student: string; subject: string; amount: number }[] }>()
  for (const a of allocations.docs as Record<string, any>[]) {
    if (typeof a.teacher !== 'object' || typeof a.student !== 'object') continue
    if (typeof a.teacherPayout !== 'number') continue
    const entry = byTeacher.get(a.teacher.id) ?? { teacher: a.teacher, lines: [] as { student: string; subject: string; amount: number }[] }
    entry.lines.push({ student: a.student.name, subject: a.subject, amount: a.teacherPayout })
    byTeacher.set(a.teacher.id, entry)
  }

  for (const { teacher, lines } of byTeacher.values()) {
    result.considered += 1
    if (!teacher.email) {
      result.skipped += 1
      result.details.push(`${teacher.name}: no email on file`)
      continue
    }
    const outcome = await sendTemplatedEmail({
      payload,
      template: 'teacher_monthly_payment',
      to: teacher.email,
      toName: teacher.name,
      data: { name: teacher.name, monthLabel, lines, total: lines.reduce((s, l) => s + l.amount, 0) },
      relatedType: 'teacher-profile',
      relatedId: teacher.id,
      dedupeKey: `payout:${month}:${teacher.id}`,
    })
    tally(result, outcome.status)
    if (outcome.error && outcome.status !== 'duplicate') result.details.push(`${teacher.email}: ${outcome.error}`)
  }
  return result
}
