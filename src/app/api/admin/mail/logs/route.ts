import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { emailLogStatuses } from '@/collections/EmailLogs'
import { parsePaginationParams } from '@/lib/studentValidation'

/**
 * GET /api/admin/mail/logs?status=&template=&search=&page=&limit=
 * Paginated email log, newest first. `search` matches the recipient or subject.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const sp = new URL(request.url).searchParams
    const { page, limit } = parsePaginationParams(sp)
    const and: Record<string, any>[] = []
    const status = sp.get('status')
    if (status && (emailLogStatuses as readonly string[]).includes(status)) and.push({ status: { equals: status } })
    const template = sp.get('template')
    if (template) and.push({ template: { equals: template } })
    const search = sp.get('search')?.trim()
    if (search) and.push({ or: [{ recipient: { contains: search } }, { subject: { contains: search } }] })

    const result = await (auth.payload as any).find({
      collection: 'email-logs',
      where: and.length ? { and } : {},
      sort: '-createdAt',
      page,
      limit,
      depth: 0,
      overrideAccess: true,
    })
    return apiSuccess(
      {
        docs: (result.docs as Record<string, any>[]).map((d) => ({
          id: d.id,
          recipient: d.recipient,
          recipientName: d.recipientName ?? null,
          template: d.template,
          subject: d.subject,
          status: d.status,
          error: d.error ?? null,
          attempts: d.attempts ?? 0,
          retryable: Boolean(d.retryable),
          sentAt: d.sentAt ?? null,
          relatedType: d.relatedType ?? null,
          relatedId: d.relatedId ?? null,
          createdAt: d.createdAt,
        })),
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
      },
      'Email log fetched successfully.',
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch the email log.')
  }
}
