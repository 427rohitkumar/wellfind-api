import { apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'

/** GET /api/notifications/unread-count */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const res = await (auth.payload as any).count({
      collection: 'notifications',
      where: { and: [{ user: { equals: auth.user.id } }, { readAt: { exists: false } }] },
      overrideAccess: true,
    })
    return apiSuccess({ count: res.totalDocs as number }, 'Unread notifications.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to count notifications.')
  }
}
