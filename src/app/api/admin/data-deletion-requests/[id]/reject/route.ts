import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireSuperAdmin } from '@/lib/api'
import { parseIdParam } from '@/lib/notificationApi'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** POST /api/admin/data-deletion-requests/:id/reject { reason }: e.g. the requester could not be verified. Super admin only. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const parsed = parseIdParam((await context.params).id)
    if (!parsed.ok) return parsed.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const reason = typeof body.data.reason === 'string' ? body.data.reason.trim().slice(0, 300) : ''
    if (!reason) return apiError('A reason is required.', 400, [{ field: 'reason', message: 'A reason is required.' }])

    const doc = await (auth.payload as any)
      .findByID({ collection: 'data-deletion-requests', id: parsed.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!doc) return apiError('Request not found.', 404)
    if (doc.status !== 'pending' && doc.status !== 'failed') return apiError('This request was already handled.', 409)

    await (auth.payload as any).update({
      collection: 'data-deletion-requests',
      id: doc.id,
      data: {
        status: 'rejected',
        rejectionReason: reason,
        processedBy: auth.user.id,
        processedAt: new Date().toISOString(),
        fullName: null,
        email: null,
        phone: null,
        message: null,
      },
      overrideAccess: true,
    })
    return apiSuccess({ rejected: true }, 'The request was rejected.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to reject the request.')
  }
}
