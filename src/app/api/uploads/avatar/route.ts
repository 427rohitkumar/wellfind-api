import { apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { removeAvatar } from '@/services/uploadService'

/** DELETE /api/uploads/avatar: removes the caller's profile photo. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await removeAvatar(auth.payload, auth.user), 'Profile photo removed.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to remove the profile photo.')
  }
}
