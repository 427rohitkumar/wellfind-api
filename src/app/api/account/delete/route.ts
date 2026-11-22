import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireActiveUser } from '@/lib/api'
import { getClientIP, rateLimit } from '@/lib/auth'
import { deleteAccount } from '@/services/accountDeletionService'

/**
 * POST /api/account/delete { password, confirm: "DELETE" }
 * Deletes (anonymises) the signed-in user's own account after re-checking their password.
 * Teachers and staff only; a super admin cannot delete themselves here.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response

    const limit = rateLimit(`account-delete:${auth.user.id}:${getClientIP(request.headers)}`, 5)
    if (!limit.allowed) return apiError('Too many attempts. Please try again later.', 429)

    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const { password, confirm } = body.data
    if (confirm !== 'DELETE') {
      return apiError('Type DELETE to confirm.', 400, [{ field: 'confirm', message: 'Type DELETE to confirm.' }])
    }
    if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
      return apiError('Enter your password to confirm.', 400, [{ field: 'password', message: 'Password is required.' }])
    }
    if (!auth.user.email) return apiError('Account not found.', 404)

    try {
      await (auth.payload as any).login({ collection: 'users', data: { email: auth.user.email, password } })
    } catch {
      return apiError('Incorrect password.', 401, [{ field: 'password', message: 'Incorrect password.' }])
    }

    const result = await deleteAccount(auth.payload, auth.user.id)
    if (!result.ok) {
      const status = { NOT_FOUND: 404, ALREADY_DELETED: 410, SUPER_ADMIN: 403, ACTIVE_CLASSES: 409, FAILED: 500 }[result.code]
      return apiError(result.message, status)
    }
    return apiSuccess({ deleted: true }, 'Your account and personal data have been deleted.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to delete the account.')
  }
}
