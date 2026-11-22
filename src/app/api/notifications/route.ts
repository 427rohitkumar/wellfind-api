import { apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { serializeNotification } from '@/lib/notificationApi'

/** GET /api/notifications?page=1&limit=20&unread=true: the signed-in user's notifications, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const url = new URL(request.url)
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20))
    const clauses: Record<string, unknown>[] = [{ user: { equals: auth.user.id } }]
    if (url.searchParams.get('unread') === 'true') clauses.push({ readAt: { exists: false } })
    const res = await (auth.payload as any).find({
      collection: 'notifications',
      where: { and: clauses },
      sort: '-createdAt',
      page,
      limit,
      depth: 0,
      overrideAccess: true,
    })
    return apiSuccess(
      {
        notifications: (res.docs as Record<string, any>[]).map(serializeNotification),
        page: res.page,
        limit: res.limit,
        totalDocs: res.totalDocs,
        totalPages: res.totalPages,
        hasNextPage: res.hasNextPage,
      },
      'Notifications.',
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to load notifications.')
  }
}

/** DELETE /api/notifications: clear every notification of the signed-in user (own rows only). */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const res = await (auth.payload as any).delete({
      collection: 'notifications',
      where: { user: { equals: auth.user.id } },
      overrideAccess: true,
    })
    return apiSuccess({ deleted: (res.docs as unknown[]).length }, 'Notifications cleared.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to clear notifications.')
  }
}
