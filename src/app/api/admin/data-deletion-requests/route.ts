import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'

/** GET /api/admin/data-deletion-requests?status=pending: super admin only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const status = new URL(request.url).searchParams.get('status')
    const res = await (auth.payload as any).find({
      collection: 'data-deletion-requests',
      where: status ? { status: { equals: status } } : {},
      sort: '-createdAt',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    return apiSuccess({ requests: res.docs, totalDocs: res.totalDocs }, 'Data deletion requests.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to load requests.')
  }
}
