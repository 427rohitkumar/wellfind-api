import { apiSuccess, handleRouteError } from '@/lib/api'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { createRegistrationOrder } from '@/services/paymentService'

/** POST /api/teacher-applications/me/payment/order — starts an online payment (Razorpay order). */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await createRegistrationOrder(auth.payload, auth.user), 'Payment order created.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to start the payment.')
  }
}
