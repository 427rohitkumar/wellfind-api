import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { getRazorpayConfig } from '@/lib/razorpay'
import { getPaymentStats } from '@/services/paymentAnalytics'

/** GET /api/admin/payments/stats — collected totals, category breakdown, monthly trend and gateway status. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const cfg = getRazorpayConfig()
    const stats = await getPaymentStats(auth.payload)
    return apiSuccess(
      { ...stats, gateway: { configured: cfg.configured, mode: cfg.mode, webhookConfigured: Boolean(cfg.webhookSecret) } },
      'Payment statistics fetched successfully.',
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch payment statistics.')
  }
}
