import { apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { isPushConfigured, pushConfig } from '@/services/pushService'

/** GET /api/push/config: whether push is available, and the public key the browser needs to subscribe. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    return apiSuccess({ enabled: isPushConfigured(), publicKey: isPushConfigured() ? pushConfig().publicKey : null }, 'Push configuration.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to read push configuration.')
  }
}
