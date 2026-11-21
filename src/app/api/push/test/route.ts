import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { isPushConfigured, pushToUsers } from '@/services/pushService'

/** POST /api/push/test: send a test notification to the signed-in user's own browsers. */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (!isPushConfigured()) return apiError('Push notifications are not set up on the server.', 503)
    const sent = await pushToUsers(auth.payload, [auth.user.id], { title: 'Wellfind Academic', body: 'Notifications are working. You will be alerted here.', url: '/', tag: 'push-test' })
    return apiSuccess({ sent }, sent ? 'Test notification sent.' : 'No browser is subscribed yet.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to send the test notification.')
  }
}
