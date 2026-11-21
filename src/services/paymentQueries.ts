import type { Payload } from 'payload'
import { getRazorpayConfig } from '@/lib/razorpay'
import { extractRelationId } from '@/lib/studentValidation'

export function serializePayment(doc: Record<string, any>) {
  return {
    id: doc.id,
    category: doc.category,
    status: doc.status,
    amount: doc.amount,
    currency: doc.currency || 'INR',
    gateway: doc.gateway || 'razorpay',
    mode: doc.mode ?? null,
    method: doc.method ?? null,
    razorpayOrderId: doc.razorpayOrderId ?? null,
    razorpayPaymentId: doc.razorpayPaymentId ?? null,
    payerName: doc.payerName ?? null,
    payerEmail: doc.payerEmail ?? null,
    payerPhone: doc.payerPhone ?? null,
    description: doc.description ?? null,
    paidAt: doc.paidAt ?? null,
    failureReason: doc.failureReason ?? null,
    refundedAmount: doc.refundedAmount ?? null,
    teacherEnquiry: extractRelationId(doc.teacherEnquiry),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/** Gateway status the teacher portal needs (no secrets). */
export function gatewayInfo() {
  const cfg = getRazorpayConfig()
  return { enabled: cfg.configured, mode: cfg.mode }
}

/** Own payment attempts, newest first (shown in the teacher portal). */
export async function listOwnPayments(payload: Payload, enquiryId: number | string) {
  const res = await (payload as any).find({
    collection: 'payments',
    where: { teacherEnquiry: { equals: enquiryId } },
    sort: '-createdAt',
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  return (res.docs as Record<string, any>[]).map(serializePayment)
}

