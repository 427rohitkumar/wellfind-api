import { getPayload } from 'payload'
import config from '@/payload.config'
import { handleRazorpayWebhook } from '@/services/paymentService'

/**
 * POST /api/payments/razorpay/webhook
 * Public endpoint called by Razorpay. Authenticated only by the X-Razorpay-Signature header
 * (HMAC of the raw body with RAZORPAY_WEBHOOK_SECRET). Updates payments and fee status automatically.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const payload = await getPayload({ config })
  const result = await handleRazorpayWebhook(
    payload,
    rawBody,
    request.headers.get('x-razorpay-signature'),
    request.headers.get('x-razorpay-event-id'),
  )
  return Response.json({ ok: result.ok, message: result.message }, { status: result.status })
}
