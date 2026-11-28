import type { Payload } from 'payload'
import { testPeriods, workStatuses } from '@/collections/AllocationWork'
import { parsePaginationParams } from '@/lib/studentValidation'

/**
 * Staff view of the academic tests teachers record for their students (`allocation-work`, kind `test`).
 * Read only: marks are entered by the teaching teacher through the teacher routes.
 */
export async function listAcademicTests(payload: Payload, sp: URLSearchParams) {
  const { page, limit } = parsePaginationParams(sp)
  const and: Record<string, any>[] = [{ kind: { equals: 'test' } }]
  const period = sp.get('period')
  if (period && (testPeriods as readonly string[]).includes(period)) {
    // Tests recorded before periods existed count as "other".
    and.push(period === 'other' ? { or: [{ period: { equals: 'other' } }, { period: { exists: false } }] } : { period: { equals: period } })
  }
  const status = sp.get('status')
  if (status && (workStatuses as readonly string[]).includes(status)) and.push({ status: { equals: status } })

  const res = await (payload as any).find({
    collection: 'allocation-work',
    where: { and },
    sort: '-createdAt',
    page,
    limit,
    depth: 2,
    overrideAccess: true,
  })

  const object = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, any>) : null)
  return {
    docs: (res.docs as Record<string, any>[]).map((d) => {
      const allocation = object(d.allocation)
      const student = object(allocation?.student)
      const teacher = object(allocation?.teacher)
      return {
        id: d.id,
        title: d.title,
        description: d.description ?? null,
        period: d.period ?? 'other',
        testDate: d.dueDate ?? null,
        status: d.status,
        marks: d.marks ?? null,
        maxMarks: d.maxMarks ?? null,
        percentage: typeof d.marks === 'number' && typeof d.maxMarks === 'number' ? Math.round((d.marks / d.maxMarks) * 1000) / 10 : null,
        feedback: d.feedback ?? null,
        subject: allocation?.subject ?? null,
        student: student ? { id: student.id, name: student.name, studentClass: student.studentClass } : null,
        teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        createdAt: d.createdAt,
      }
    }),
    totalDocs: res.totalDocs,
    totalPages: res.totalPages,
    page: res.page,
    limit: res.limit,
    hasNextPage: res.hasNextPage,
    hasPrevPage: res.hasPrevPage,
  }
}
