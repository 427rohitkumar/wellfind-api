import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { verifyMailConnection } from '@/services/mailService'

/** POST /api/admin/mail/verify — checks the SMTP connection and login without sending anything. */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await verifyMailConnection(), 'SMTP check finished.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to check the SMTP connection.')
  }
}
