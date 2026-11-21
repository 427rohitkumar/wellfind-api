import { apiSuccess, handleRouteError, parseJsonObject } from '@/lib/api'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { submitOwnPayment } from '@/services/teacherApplicationService'

/**
 * POST /api/teacher-applications/me/payment
 * Body: { method: 'upi' | 'bank_transfer' | 'other', transactionRef: string }
 * Records that the teacher has paid the registration fee; an admin verifies it.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const result = await submitOwnPayment(auth.payload, auth.user, body.data)
    return apiSuccess(result, 'Payment details submitted. We will verify and confirm shortly.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to submit payment details.')
  }
}
