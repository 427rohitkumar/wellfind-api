import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { paymentCategories, paymentStatuses } from '@/collections/Payments'
import { parsePaginationParams } from '@/lib/studentValidation'
import { serializePayment } from '@/services/paymentService'

/** GET /api/admin/payments?category=&status=&mode=test|live&search=&from=&to=&page=&limit= */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const sp = new URL(request.url).searchParams
    const { page, limit } = parsePaginationParams(sp)
    const and: Record<string, any>[] = []
    const category = sp.get('category')
    if (category && (paymentCategories as readonly string[]).includes(category)) and.push({ category: { equals: category } })
    const status = sp.get('status')
    if (status && (paymentStatuses as readonly string[]).includes(status)) and.push({ status: { equals: status } })
    const mode = sp.get('mode')
    if (mode === 'test' || mode === 'live') and.push({ mode: { equals: mode } })
    const from = sp.get('from')
    const to = sp.get('to')
    if (from && !Number.isNaN(Date.parse(from))) and.push({ createdAt: { greater_than_equal: new Date(from).toISOString() } })
    if (to && !Number.isNaN(Date.parse(to))) and.push({ createdAt: { less_than_equal: new Date(`${to}T23:59:59.999Z`).toISOString() } })
    const search = sp.get('search')?.trim()
    if (search) {
      and.push({
        or: [
          { payerName: { contains: search } },
          { payerEmail: { contains: search } },
          { razorpayPaymentId: { contains: search } },
          { razorpayOrderId: { contains: search } },
        ],
      })
    }
    const result = await (auth.payload as any).find({
      collection: 'payments',
      where: and.length ? { and } : {},
      sort: '-createdAt',
      page,
      limit,
      depth: 0,
      overrideAccess: true,
    })
    return apiSuccess(
      {
        docs: (result.docs as Record<string, any>[]).map(serializePayment),
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
      },
      'Payments fetched successfully.',
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch payments.')
  }
}
