import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

export const paymentCategories = ['teacher_registration', 'tuition_fee', 'other'] as const
export type PaymentCategory = (typeof paymentCategories)[number]

export const paymentStatuses = ['created', 'paid', 'failed', 'refunded'] as const
export type PaymentStatus = (typeof paymentStatuses)[number]

export const paymentCategoryLabels: Record<PaymentCategory, string> = {
  teacher_registration: 'Teacher registration',
  tuition_fee: 'Tuition fee',
  other: 'Other',
}

/**
 * Wellfind Academic — every payment attempt made through the payment gateway.
 * One row per Razorpay order. Written only by the payment service (checkout verification
 * and the gateway webhook); administrators read it in the Payments tab.
 * Card or UPI details never reach our servers, only the gateway's ids.
 */
export const Payments: CollectionConfig = {
  slug: 'payments',
  admin: {
    useAsTitle: 'razorpayOrderId',
    defaultColumns: ['category', 'payerName', 'amount', 'status', 'paidAt'],
  },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'payments'),
    read: ({ req: { user } }) => canRead(user, 'payments'),
    update: ({ req: { user } }) => canWrite(user, 'payments'),
    delete: ({ req: { user } }) => canWrite(user, 'payments'),
  },
  fields: [
    {
      name: 'category',
      type: 'select',
      options: [...paymentCategories],
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      options: [...paymentStatuses],
      defaultValue: 'created',
      required: true,
      index: true,
    },
    { name: 'amount', type: 'number', required: true, admin: { description: 'Amount in INR (rupees).' } },
    { name: 'currency', type: 'text', defaultValue: 'INR', maxLength: 10 },
    { name: 'gateway', type: 'text', defaultValue: 'razorpay', maxLength: 30 },
    {
      name: 'mode',
      type: 'select',
      options: ['test', 'live'],
      index: true,
      admin: { description: 'Razorpay key mode when the order was created. Test payments are not real money.' },
    },
    { name: 'razorpayOrderId', type: 'text', unique: true, index: true, maxLength: 80 },
    { name: 'razorpayPaymentId', type: 'text', index: true, maxLength: 80 },
    { name: 'receipt', type: 'text', maxLength: 80 },
    { name: 'method', type: 'text', maxLength: 40, admin: { description: 'upi, card, netbanking, wallet…' } },
    { name: 'payerName', type: 'text', maxLength: 200 },
    { name: 'payerEmail', type: 'text', maxLength: 320 },
    { name: 'payerPhone', type: 'text', maxLength: 30 },
    { name: 'payerUser', type: 'relationship', relationTo: 'users' },
    { name: 'teacherEnquiry', type: 'relationship', relationTo: 'teacher-enquiries', index: true },
    { name: 'description', type: 'text', maxLength: 300 },
    { name: 'paidAt', type: 'date', index: true },
    { name: 'failureReason', type: 'text', maxLength: 500 },
    { name: 'refundedAmount', type: 'number' },
    {
      name: 'events',
      type: 'array',
      admin: { description: 'Audit trail of gateway events for this payment.' },
      fields: [
        { name: 'type', type: 'text', required: true, maxLength: 60 },
        { name: 'at', type: 'date' },
        { name: 'source', type: 'text', maxLength: 30 },
        { name: 'eventId', type: 'text', maxLength: 100 },
        { name: 'note', type: 'text', maxLength: 300 },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Rows created while tests run are tagged so the test setup can sweep them away.
        if (operation === 'create' && process.env.VITEST) data.receipt = 'vitest'
        return data
      },
    ],
  },
  timestamps: true,
}
