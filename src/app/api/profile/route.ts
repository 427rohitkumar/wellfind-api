import { apiSuccess, handleRouteError, parseJsonObject, requireActiveUser } from '@/lib/api'
import { getMyProfile, updateMyProfile } from '@/services/profileService'

/** GET /api/profile: the signed-in user's own profile (admin or teacher). */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await getMyProfile(auth.payload, auth.user), 'Profile fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch your profile.')
  }
}

/**
 * PATCH /api/profile: update your own basic details.
 * Admin: name, phone, gender. Teacher: name, phone, gender, locality, availability, classLevels, about.
 * The email can never be changed here (it is the login credential).
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    return apiSuccess(await updateMyProfile(auth.payload, auth.user, body.data), 'Profile updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update your profile.')
  }
}
