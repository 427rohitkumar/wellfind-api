import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { listTemplates } from '@/lib/mail/templates'
import { getMailStats } from '@/services/mailService'

/** GET /api/admin/mail/stats — totals, per-template counts and the (secret-free) mail configuration. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const stats = await getMailStats(auth.payload)
    return apiSuccess({ ...stats, templateList: listTemplates() }, 'Mail statistics fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch mail statistics.')
  }
}
