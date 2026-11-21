import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Minimal Razorpay client built on the REST API (no SDK needed).
 * Keys come from the environment: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 */
export interface RazorpayConfig {
  configured: boolean
  keyId: string | null
  keySecret: string | null
  webhookSecret: string | null
  /** `test` when the key id starts with rzp_test_, `live` when rzp_live_. */
  mode: 'test' | 'live' | null
}

export function getRazorpayConfig(): RazorpayConfig {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || null
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || null
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null
  const placeholder = (v: string | null) => !v || /^(YOUR_|xxx)/i.test(v)
  const configured = !placeholder(keyId) && !placeholder(keySecret)
  return {
    configured,
    keyId: configured ? keyId : null,
    keySecret: configured ? keySecret : null,
    webhookSecret: !placeholder(webhookSecret) ? webhookSecret : null,
    mode: configured ? (keyId!.startsWith('rzp_live_') ? 'live' : 'test') : null,
  }
}

export class RazorpayError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const cfg = getRazorpayConfig()
  if (!cfg.configured) throw new RazorpayError('Online payments are not configured yet.', 503)
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) {
    throw new RazorpayError(json?.error?.description || `Razorpay request failed (${res.status}).`, res.status >= 500 ? 502 : 400)
  }
  return json as T
}

export interface RazorpayOrder {
  id: string
  amount: number
  currency: string
  receipt?: string
  status: string
}

export interface RazorpayPayment {
  id: string
  order_id: string
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  method?: string
  captured?: boolean
  error_description?: string | null
  amount_refunded?: number
}

export const createOrder = (input: { amountPaise: number; receipt: string; notes?: Record<string, string> }) =>
  call<RazorpayOrder>('POST', '/orders', {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    notes: input.notes ?? {},
  })

export const fetchPayment = (paymentId: string) => call<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`)

export const capturePayment = (paymentId: string, amountPaise: number) =>
  call<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' })

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = getRazorpayConfig()
  if (!keySecret || !signature) return false
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  return safeEqual(expected, signature)
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const { webhookSecret } = getRazorpayConfig()
  if (!webhookSecret || !signature) return false
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  return safeEqual(expected, signature)
}
