import { apiError, apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { parseIdParam } from '@/lib/notificationApi'
import { anonymiseByContact } from '@/services/accountDeletionService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/admin/data-deletion-requests/:id/process: super admin only.
 * Call it after verifying that the requester really owns the e-mail / phone. Anonymises their records, then scrubs the request.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const parsed = parseIdParam((await context.params).id)
    if (!parsed.ok) return parsed.response

    const doc = await (auth.payload as any)
      .findByID({ collection: 'data-deletion-requests', id: parsed.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!doc) return apiError('Request not found.', 404)
    if (doc.status !== 'pending' && doc.status !== 'failed') return apiError('This request was already handled.', 409)

    const result = await anonymiseByContact(auth.payload, { email: doc.email, phone: doc.phone })
    if (!result.ok) {
      await (auth.payload as any).update({
        collection: 'data-deletion-requests',
        id: doc.id,
        data: { status: 'failed', rejectionReason: result.message.slice(0, 300) },
        overrideAccess: true,
      })
      return apiError(result.message, 422)
    }
    await (auth.payload as any).update({
      collection: 'data-deletion-requests',
      id: doc.id,
      data: {
        status: 'completed',
        resultSummary: result.summary,
        processedBy: auth.user.id,
        processedAt: new Date().toISOString(),
        fullName: null,
        email: null,
        phone: null,
        message: null,
      },
      overrideAccess: true,
    })
    return apiSuccess({ summary: result.summary }, 'The data was deleted and the request closed.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to process the request.')
  }
}
