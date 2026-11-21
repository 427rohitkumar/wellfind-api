import type { Payload } from 'payload'
import { paymentCategories, paymentCategoryLabels } from '@/collections/Payments'

const DAY = 86_400_000

/** Aggregates the payments ledger for the admin dashboard. Sized for thousands of rows. */
export async function getPaymentStats(payload: Payload) {
  const res = await (payload as any).find({
    collection: 'payments',
    limit: 5000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { category: true, status: true, amount: true, paidAt: true, createdAt: true, gateway: true, method: true, mode: true },
  })
  const rows = res.docs as Record<string, any>[]
  const now = Date.now()

  const paid = rows.filter((r) => r.status === 'paid')
  const sum = (list: Record<string, any>[]) => list.reduce((s, r) => s + Number(r.amount || 0), 0)
  const paidAt = (r: Record<string, any>) => new Date(r.paidAt || r.createdAt).getTime()
  const within = (list: Record<string, any>[], days: number) => list.filter((r) => now - paidAt(r) <= days * DAY)

  const byCategory = paymentCategories.map((key) => {
    const mine = rows.filter((r) => r.category === key)
    const mp = mine.filter((r) => r.status === 'paid')
    return {
      key,
      label: paymentCategoryLabels[key],
      collected: sum(mp),
      paidCount: mp.length,
      pendingCount: mine.filter((r) => r.status === 'created').length,
      failedCount: mine.filter((r) => r.status === 'failed').length,
      refundedCount: mine.filter((r) => r.status === 'refunded').length,
    }
  })

  // Last 6 calendar months, oldest first.
  const months: { month: string; label: string; total: number; byCategory: Record<string, number> }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1))
    months.push({
      month: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      total: 0,
      byCategory: Object.fromEntries(paymentCategories.map((c) => [c, 0])),
    })
  }
  for (const r of paid) {
    const key = new Date(paidAt(r)).toISOString().slice(0, 7)
    const bucket = months.find((m) => m.month === key)
    if (bucket) {
      bucket.total += Number(r.amount || 0)
      bucket.byCategory[r.category] = (bucket.byCategory[r.category] || 0) + Number(r.amount || 0)
    }
  }

  const methods: Record<string, number> = {}
  for (const r of paid) {
    const m = r.method || (r.gateway === 'manual' ? 'manual' : 'other')
    methods[m] = (methods[m] || 0) + 1
  }

  const attempts = rows.filter((r) => r.status === 'paid' || r.status === 'failed').length
  return {
    totals: {
      collected: sum(paid),
      collectedToday: sum(within(paid, 1)),
      collected7d: sum(within(paid, 7)),
      collected30d: sum(within(paid, 30)),
      paidCount: paid.length,
      pendingCount: rows.filter((r) => r.status === 'created').length,
      failedCount: rows.filter((r) => r.status === 'failed').length,
      refundedCount: rows.filter((r) => r.status === 'refunded').length,
      successRate: attempts ? Math.round((paid.length / attempts) * 100) : null,
      averageTicket: paid.length ? Math.round(sum(paid) / paid.length) : 0,
      testCount: rows.filter((r) => r.mode === 'test').length,
      testCollected: sum(paid.filter((r) => r.mode === 'test')),
    },
    byCategory,
    months,
    methods: Object.entries(methods).map(([method, count]) => ({ method, count })).sort((a, b) => b.count - a.count),
  }
}

/**
 * Commercial view of live allocations: what families are expected to pay per month, the
 * Wellfind commission, and what each teacher is due. Online tuition payments are not collected yet,
 * so "expected" comes from the fee decided at allocation time.
 */
export async function getAllocationFinanceSummary(payload: Payload) {
  const res = await (payload as any).find({
    collection: 'teacher-allocations',
    where: { status: { in: ['assigned', 'accepted', 'active'] } },
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })
  const rows = (res.docs as Record<string, any>[])
    .filter((a) => typeof a.student === 'object' && typeof a.teacher === 'object')
    .map((a) => ({
      id: a.id,
      studentId: a.student.id,
      studentName: a.student.name,
      studentClass: a.student.studentClass,
      teacherId: a.teacher.id,
      teacherName: a.teacher.name,
      subject: a.subject,
      status: a.status,
      monthlyFee: a.monthlyFee ?? null,
      commissionPercent: a.commissionPercent ?? null,
      commissionAmount: a.commissionAmount ?? null,
      teacherPayout: a.teacherPayout ?? null,
      allocatedAt: a.allocatedAt,
    }))

  const priced = rows.filter((r) => typeof r.monthlyFee === 'number')
  const sum = (key: 'monthlyFee' | 'commissionAmount' | 'teacherPayout') => priced.reduce((s, r) => s + Number(r[key] || 0), 0)

  const teachers = new Map<number | string, { teacherId: number | string; teacherName: string; students: number; monthlyFee: number; commission: number; payout: number }>()
  for (const r of priced) {
    const t = teachers.get(r.teacherId) ?? { teacherId: r.teacherId, teacherName: r.teacherName, students: 0, monthlyFee: 0, commission: 0, payout: 0 }
    t.students += 1
    t.monthlyFee += Number(r.monthlyFee || 0)
    t.commission += Number(r.commissionAmount || 0)
    t.payout += Number(r.teacherPayout || 0)
    teachers.set(r.teacherId, t)
  }

  return {
    totals: {
      liveAllocations: rows.length,
      withoutTerms: rows.length - priced.length,
      expectedMonthlyFees: sum('monthlyFee'),
      expectedCommission: sum('commissionAmount'),
      expectedTeacherPayouts: sum('teacherPayout'),
    },
    allocations: rows,
    teachers: [...teachers.values()].sort((a, b) => b.payout - a.payout),
  }
}
