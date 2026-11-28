import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { getMailConfig } from '@/lib/mail/config'
import {
  capturePayment,
  createOrder,
  fetchPayment,
  getRazorpayConfig,
  RazorpayError,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type RazorpayPayment,
} from '@/lib/razorpay'
import { extractRelationId } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'
import { findOwnApplication } from '@/services/teacherApplicationService'
import { serializePayment } from '@/services/paymentQueries'
import { nextExpiry, registrationState } from '@/services/registrationRenewal'
import { handleRazorpayPayoutWebhook } from '@/services/payoutService'

export { serializePayment }

const PAYABLE_STATUSES = ['shortlisted', 'evaluation_completed']
const ORDER_REUSE_MS = 30 * 60 * 1000

const toPaise = (rupees: number) => Math.round(rupees * 100)

function wrapGateway(err: unknown): never {
  if (err instanceof ServiceError) throw err
  if (err instanceof RazorpayError) throw new ServiceError(err.message, err.status === 503 ? 503 : 502)
  throw new ServiceError(err instanceof Error ? err.message : 'Payment gateway error.', 502)
}

export async function findByOrderId(payload: Payload, orderId: string): Promise<Record<string, any> | null> {
  const res = await (payload as any).find({
    collection: 'payments',
    where: { razorpayOrderId: { equals: orderId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (res.docs[0] as Record<string, any>) ?? null
}

const event = (type: string, source: string, note?: string, eventId?: string) => ({
  type,
  source,
  at: new Date().toISOString(),
  ...(note ? { note: note.slice(0, 290) } : {}),
  ...(eventId ? { eventId } : {}),
})

/** Safe, idempotent "this payment succeeded": updates the payment row and settles the registration fee. */
async function markPaid(
  payload: Payload,
  row: Record<string, any>,
  rp: RazorpayPayment,
  source: 'checkout' | 'webhook',
  eventId?: string,
): Promise<Record<string, any>> {
  if (row.status === 'paid') return row
  const paidAt = new Date().toISOString()
  const updated = (await (payload as any).update({
    collection: 'payments',
    id: row.id,
    data: {
      status: 'paid',
      razorpayPaymentId: rp.id,
      method: rp.method ?? row.method ?? null,
      paidAt,
      failureReason: null,
      events: [...(row.events ?? []), event('paid', source, `Payment ${rp.id} captured`, eventId)],
    },
    overrideAccess: true,
  })) as Record<string, any>

  const enquiryId = extractRelationId(row.teacherEnquiry)
  if (row.category === 'teacher_registration' && enquiryId) {
    const enquiry = (await (payload as any).findByID({
      collection: 'teacher-enquiries',
      id: enquiryId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
    })) as Record<string, any> | null
    const fee = (enquiry?.registrationFee ?? {}) as Record<string, any>
    if (enquiry && enquiry.applicationStatus === 'approved' && registrationState(enquiry).canRenew) {
      await applyRenewal(payload, enquiry, row, rp, paidAt)
    } else if (enquiry && fee.status !== 'paid' && fee.status !== 'waived') {
      // The enquiry hook sets the validity period and sends the "payment received" email.
      await (payload as any).update({
        collection: 'teacher-enquiries',
        id: enquiryId,
        data: {
          registrationFee: {
            ...fee,
            status: 'paid',
            amount: row.amount,
            paymentMethod: 'razorpay',
            transactionRef: rp.id,
            paymentDate: paidAt,
          },
        },
        overrideAccess: true,
      })
    }
  }
  return updated
}

/** Yearly renewal: pays for another year, extending the validity and telling the teacher. */
async function applyRenewal(
  payload: Payload,
  enquiry: Record<string, any>,
  row: Record<string, any>,
  rp: RazorpayPayment,
  paidAt: string,
) {
  const cfg = getMailConfig()
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  const expiresAt = nextExpiry(fee.expiresAt, cfg.registrationValidityDays)
  const newFee = {
    ...fee,
    status: 'paid',
    amount: row.amount,
    paymentMethod: 'razorpay',
    transactionRef: rp.id,
    paymentDate: paidAt,
    expiresAt,
  }
  // skipMail: the renewal email below is sent once, with the right wording.
  await (payload as any).update({
    collection: 'teacher-enquiries',
    id: enquiry.id,
    data: { registrationFee: newFee },
    overrideAccess: true,
    context: { skipMail: true },
  })

  const profileId = extractRelationId(enquiry.teacherProfile)
  const profiles = profileId
    ? { docs: [{ id: profileId }] }
    : await (payload as any).find({ collection: 'teacher-profiles', where: { teacherEnquiry: { equals: enquiry.id } }, limit: 1, depth: 0, overrideAccess: true })
  const profile = profiles.docs[0] as Record<string, any> | undefined
  if (profile) {
    await (payload as any).update({
      collection: 'teacher-profiles',
      id: profile.id,
      data: {
        registrationFee: {
          status: 'paid',
          amount: row.amount,
          currency: 'INR',
          year: `${new Date(paidAt).getFullYear()}–${new Date(expiresAt).getFullYear()}`,
          paymentDate: paidAt.slice(0, 10),
          transactionRef: rp.id,
          expiresAt,
        },
      },
      overrideAccess: true,
    })
  }

  const { notifyPaymentReceived } = await import('@/services/mailNotifications')
  await notifyPaymentReceived(payload, { ...enquiry, registrationFee: newFee }, { renewal: true, paymentId: rp.id })
  // Renewals keep the fee status at "paid", so the enquiry hook does not fire: announce the payment here (once per payment id).
  const { pushRegistrationPaid } = await import('@/services/pushEvents')
  pushRegistrationPaid(payload, { ...enquiry, registrationFee: newFee })
}

async function markFailed(payload: Payload, row: Record<string, any>, reason: string, source: string, eventId?: string) {
  if (row.status === 'paid') return row
  return (payload as any).update({
    collection: 'payments',
    id: row.id,
    data: {
      status: 'failed',
      failureReason: reason.slice(0, 480),
      events: [...(row.events ?? []), event('failed', source, reason, eventId)],
    },
    overrideAccess: true,
  })
}

/** Creates (or reuses) a Razorpay order for the logged-in teacher's registration fee. */
export async function createRegistrationOrder(payload: Payload, user: AuthUserRecord) {
  const cfg = getRazorpayConfig()
  if (!cfg.configured) throw new ServiceError('Online payments are not available yet. Please try again later.', 503)

  const enquiry = await findOwnApplication(payload, user)
  const status = String(enquiry.applicationStatus || 'new')
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  const renewal = registrationState(enquiry)
  if (!renewal.canRenew) {
    if (!PAYABLE_STATUSES.includes(status)) {
      throw new ServiceError('Payment opens once your application is shortlisted.', 409)
    }
    if (fee.status === 'paid' || fee.status === 'waived') {
      throw new ServiceError(
        enquiry.applicationStatus === 'approved'
          ? 'Your registration is valid. Renewal opens closer to the expiry date.'
          : 'Your registration fee is already settled.',
        409,
      )
    }
  }

  // The amount is decided here on the server, never taken from the browser.
  const amount = typeof fee.amount === 'number' && fee.amount > 0 ? fee.amount : getMailConfig().registrationFeeAmount

  const recent = await (payload as any).find({
    collection: 'payments',
    where: {
      and: [
        { teacherEnquiry: { equals: enquiry.id } },
        { category: { equals: 'teacher_registration' } },
        { status: { equals: 'created' } },
        { createdAt: { greater_than: new Date(Date.now() - ORDER_REUSE_MS).toISOString() } },
      ],
    },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  let row = recent.docs[0] as Record<string, any> | undefined
  if (row && row.amount !== amount) row = undefined

  try {
    if (!row) {
      const order = await createOrder({
        amountPaise: toPaise(amount),
        receipt: `reg${enquiry.id}-${Date.now().toString(36)}`.slice(0, 40),
        notes: { purpose: renewal.canRenew ? 'teacher_registration_renewal' : 'teacher_registration', applicationId: String(enquiry.id) },
      })
      row = (await (payload as any).create({
        collection: 'payments',
        data: {
          category: 'teacher_registration',
          status: 'created',
          amount,
          currency: 'INR',
          gateway: 'razorpay',
          mode: cfg.mode ?? undefined,
          razorpayOrderId: order.id,
          receipt: order.receipt,
          payerName: enquiry.fullName,
          payerEmail: enquiry.email ?? undefined,
          payerPhone: enquiry.mobileNumber,
          payerUser: user.id,
          teacherEnquiry: enquiry.id,
          description: renewal.canRenew ? 'Teacher registration renewal' : 'Teacher registration fee',
          events: [event('order_created', 'server', `Order ${order.id}`)],
        },
        overrideAccess: true,
      })) as Record<string, any>
    }
  } catch (err) {
    wrapGateway(err)
  }

  return {
    keyId: cfg.keyId,
    mode: cfg.mode,
    orderId: row!.razorpayOrderId,
    amountPaise: toPaise(row!.amount),
    currency: 'INR',
    name: getMailConfig().brandName,
    description: renewal.canRenew ? 'Teacher registration renewal (1 year)' : 'Teacher registration fee (1 year)',
    prefill: { name: enquiry.fullName, email: enquiry.email ?? '', contact: enquiry.mobileNumber ?? '' },
  }
}

/** Confirms a checkout result with the signature and the gateway, then settles the fee. */
export async function verifyRegistrationPayment(payload: Payload, user: AuthUserRecord, body: Record<string, unknown>) {
  const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : ''
  const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : ''
  const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : ''
  if (!orderId || !paymentId || !signature) {
    throw new ServiceError('The payment confirmation is incomplete.', 400)
  }

  const enquiry = await findOwnApplication(payload, user)
  const row = await findByOrderId(payload, orderId)
  if (!row || extractRelationId(row.teacherEnquiry) !== enquiry.id) {
    throw new ServiceError('This payment does not belong to your application.', 404)
  }
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    throw new ServiceError('Payment verification failed. If money was deducted, it will be confirmed automatically.', 400)
  }
  if (row.status === 'paid') return { payment: serializePayment(row), settled: true }

  try {
    let rp = await fetchPayment(paymentId)
    if (rp.order_id !== orderId || rp.amount !== toPaise(row.amount)) {
      throw new ServiceError('The paid amount does not match this order.', 400)
    }
    if (rp.status === 'authorized') rp = await capturePayment(paymentId, rp.amount)
    if (rp.status === 'captured') {
      const paid = await markPaid(payload, row, rp, 'checkout')
      return { payment: serializePayment(paid), settled: true }
    }
    if (rp.status === 'failed') {
      const failed = await markFailed(payload, row, rp.error_description || 'Payment failed', 'checkout')
      return { payment: serializePayment(failed), settled: false }
    }
    return { payment: serializePayment(row), settled: false }
  } catch (err) {
    wrapGateway(err)
  }
}

/** Verifies and settles a checkout result directly using the orderId (for hosted checkout page). */
export async function verifyAndSettleCheckout(payload: Payload, body: Record<string, unknown>) {
  const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : ''
  const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : ''
  const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : ''
  if (!orderId || !paymentId || !signature) {
    throw new ServiceError('The payment confirmation is incomplete.', 400)
  }

  const row = await findByOrderId(payload, orderId)
  if (!row) {
    throw new ServiceError('Payment order not found.', 404)
  }
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    throw new ServiceError('Payment verification failed.', 400)
  }
  if (row.status === 'paid') return { settled: true, payment: row }

  try {
    let rp = await fetchPayment(paymentId)
    if (rp.order_id !== orderId || rp.amount !== toPaise(row.amount)) {
      throw new ServiceError('The paid amount does not match this order.', 400)
    }
    if (rp.status === 'authorized') rp = await capturePayment(paymentId, rp.amount)
    if (rp.status === 'captured') {
      const paid = await markPaid(payload, row, rp, 'checkout')
      return { settled: true, payment: paid }
    }
    if (rp.status === 'failed') {
      const failed = await markFailed(payload, row, rp.error_description || 'Payment failed', 'checkout')
      return { settled: false, payment: failed }
    }
    return { settled: false, payment: row }
  } catch (err) {
    wrapGateway(err)
  }
}

/** Records a fee that was settled outside the gateway (admin marked it paid) so Payments shows it too. */
export async function recordManualRegistrationPayment(payload: Payload, enquiry: Record<string, any>) {
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  if (fee.status !== 'paid') return
  const existing = await (payload as any).find({
    collection: 'payments',
    where: { and: [{ teacherEnquiry: { equals: enquiry.id } }, { category: { equals: 'teacher_registration' } }, { status: { equals: 'paid' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) return
  await (payload as any).create({
    collection: 'payments',
    data: {
      category: 'teacher_registration',
      status: 'paid',
      amount: typeof fee.amount === 'number' ? fee.amount : getMailConfig().registrationFeeAmount,
      currency: 'INR',
      gateway: 'manual',
      method: fee.paymentMethod ?? 'manual',
      razorpayPaymentId: fee.transactionRef || undefined,
      payerName: enquiry.fullName,
      payerEmail: enquiry.email ?? undefined,
      payerPhone: enquiry.mobileNumber,
      teacherEnquiry: enquiry.id,
      description: 'Teacher registration fee (marked paid by admin)',
      paidAt: fee.paymentDate || new Date().toISOString(),
      events: [event('marked_paid', 'admin')],
    },
    overrideAccess: true,
  })
}

/** Razorpay webhook: the source of truth that makes payments update on their own. */
export async function handleRazorpayWebhook(
  payload: Payload,
  rawBody: string,
  signature: string | null,
  eventId: string | null,
): Promise<{ ok: boolean; status: number; message: string }> {
  if (!getRazorpayConfig().webhookSecret) return { ok: false, status: 503, message: 'Webhook secret is not configured.' }
  if (!verifyWebhookSignature(rawBody, signature)) return { ok: false, status: 400, message: 'Invalid signature.' }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { ok: false, status: 400, message: 'Invalid payload.' }
  }
  const type = String(body?.event || '')
  if (type.startsWith('payout.')) {
    return handleRazorpayPayoutWebhook(payload, body, eventId)
  }
  const entity = body?.payload?.payment?.entity as (RazorpayPayment & { error_description?: string }) | undefined
  const orderId = entity?.order_id || body?.payload?.order?.entity?.id
  if (!orderId) return { ok: true, status: 200, message: 'Ignored (no order).' }

  const row = await findByOrderId(payload, orderId)
  if (!row) return { ok: true, status: 200, message: 'Ignored (unknown order).' }
  if (eventId && (row.events ?? []).some((e: any) => e.eventId === eventId)) {
    return { ok: true, status: 200, message: 'Duplicate event ignored.' }
  }

  try {
    if ((type === 'payment.captured' || type === 'order.paid') && entity) {
      if (entity.amount === toPaise(row.amount)) await markPaid(payload, row, entity, 'webhook', eventId ?? undefined)
    } else if (type === 'payment.authorized' && entity) {
      // Capture authorised payments so no money is left on hold.
      if (entity.amount === toPaise(row.amount)) {
        const captured = await capturePayment(entity.id, entity.amount).catch(() => null)
        if (captured?.status === 'captured') await markPaid(payload, row, captured, 'webhook', eventId ?? undefined)
      }
    } else if (type === 'payment.failed' && entity) {
      await markFailed(payload, row, entity.error_description || 'Payment failed', 'webhook', eventId ?? undefined)
    } else if ((type === 'refund.processed' || type === 'refund.created') && body?.payload?.refund?.entity) {
      const refund = body.payload.refund.entity
      await (payload as any).update({
        collection: 'payments',
        id: row.id,
        data: {
          status: 'refunded',
          refundedAmount: Number(refund.amount || 0) / 100,
          events: [...(row.events ?? []), event('refunded', 'webhook', `Refund ${refund.id}`, eventId ?? undefined)],
        },
        overrideAccess: true,
      })
    }
  } catch {
    // Ask Razorpay to retry later rather than losing the event.
    return { ok: false, status: 500, message: 'Processing failed.' }
  }
  return { ok: true, status: 200, message: 'Processed.' }
}
