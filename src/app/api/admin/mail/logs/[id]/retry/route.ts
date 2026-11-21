import { apiError, apiSuccess, authorizeRouteWithId, handleRouteError } from '@/lib/api'
import { retryEmail } from '@/services/mailService'

/** POST /api/admin/mail/logs/:id/retry — re-send a failed or skipped email. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, { field: 'emailLogId', label: 'email log' })
    if (!pre.ok) return pre.response
    const result = await retryEmail(pre.payload, pre.entityId)
    if (!result.ok && result.status === 'failed' && !result.logId) return apiError(result.error || 'Could not retry.', 409)
    return apiSuccess(result, result.ok ? 'Email sent.' : 'Retry finished. The email was not delivered.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to retry the email.')
  }
}
