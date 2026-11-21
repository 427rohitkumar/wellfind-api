import { apiSuccess, handleRouteError, parseJsonObject } from '@/lib/api'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { verifyRegistrationPayment } from '@/services/paymentService'

/**
 * POST /api/teacher-applications/me/payment/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature } from the checkout result.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const result = await verifyRegistrationPayment(auth.payload, auth.user, body.data)
    return apiSuccess(result, result.settled ? 'Payment confirmed.' : 'Payment is not complete yet.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to verify the payment.')
  }
}
