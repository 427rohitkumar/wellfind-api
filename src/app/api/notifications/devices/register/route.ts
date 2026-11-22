import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireActiveUser } from '@/lib/api'
import { getNotificationEnvironment, isNotificationEnvironment } from '@/lib/notificationConfig'

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/**
 * POST /api/notifications/devices/register { fcmToken, platform, environment, appVersion?, deviceName? }
 * Links this install's FCM token to the signed-in user (never to a user id sent by the client).
 * The same token re-registered (app start / token refresh / another user signing in) is updated, not duplicated.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const { fcmToken, platform, environment } = body.data
    if (typeof fcmToken !== 'string' || fcmToken.length < 20 || fcmToken.length > 4096) {
      return apiError('Invalid device token.', 400, [{ field: 'fcmToken', message: 'A valid FCM token is required.' }])
    }
    if (platform !== 'android' && platform !== 'ios') {
      return apiError('Invalid platform.', 400, [{ field: 'platform', message: 'platform must be android or ios.' }])
    }
    if (!isNotificationEnvironment(environment)) {
      return apiError('Invalid environment.', 400, [{ field: 'environment', message: 'environment must be development, preview or production.' }])
    }
    // A development/preview app must not register with a production backend (and the other way round).
    if (environment !== getNotificationEnvironment()) {
      return apiError('This app build belongs to a different environment than this server.', 409, [{ field: 'environment', message: 'Environment mismatch.' }])
    }
    const data = {
      user: auth.user.id,
      fcmToken,
      platform,
      environment,
      active: true,
      lastSeen: new Date().toISOString(),
      appVersion: text(body.data.appVersion, 40),
      deviceName: text(body.data.deviceName, 120),
    }
    const payload = auth.payload as any
    const existing = await payload.find({ collection: 'user-devices', where: { fcmToken: { equals: fcmToken } }, limit: 1, depth: 0, overrideAccess: true })
    let id: number
    if (existing.docs[0]) {
      id = existing.docs[0].id
      await payload.update({ collection: 'user-devices', id, data, overrideAccess: true })
    } else {
      id = (await payload.create({ collection: 'user-devices', data, overrideAccess: true })).id
    }
    return apiSuccess({ id }, 'Device registered.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to register the device.')
  }
}
