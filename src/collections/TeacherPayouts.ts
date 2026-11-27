import type { CollectionConfig } from 'payload'
import { canRead, canWrite } from '@/lib/permissions'

/**
 * What Wellfind actually paid a teacher for one student in one month.
 * The amount due comes from the allocation (teacherPayout); a row here means "paid".
 * Recorded by the finance team in Payouts > Teacher Payments.
 */
export const TeacherPayouts: CollectionConfig = {
  slug: 'teacher-payouts',
  admin: { useAsTitle: 'month', defaultColumns: ['teacher', 'allocation', 'month', 'amount', 'paidAt'] },
  access: {
    read: ({ req: { user } }) => canRead(user, 'payments'),
    create: ({ req: { user } }) => canWrite(user, 'payments'),
    update: ({ req: { user } }) => canWrite(user, 'payments'),
    delete: ({ req: { user } }) => canWrite(user, 'payments'),
  },
  fields: [
    { name: 'allocation', type: 'relationship', relationTo: 'teacher-allocations', required: true, index: true },
    { name: 'teacher', type: 'relationship', relationTo: 'teacher-profiles', required: true, index: true },
    { name: 'month', type: 'text', required: true, index: true, admin: { description: 'YYYY-MM' } },
    { name: 'amount', type: 'number', required: true, min: 0 },
    { name: 'paidAt', type: 'date', required: true },
    {
      name: 'paymentMethod',
      label: 'Payment Method',
      type: 'select',
      options: [
        { label: 'UPI', value: 'upi' },
        { label: 'Razorpay', value: 'razorpay' },
        { label: 'Bank Transfer', value: 'bank_transfer' },
        { label: 'Other', value: 'other' },
      ],
      defaultValue: 'upi',
    },
    { name: 'reference', type: 'text', maxLength: 120 },
    { name: 'utr', label: 'UTR / Transaction Reference', type: 'text', maxLength: 120 },
    { name: 'razorpayPayoutId', label: 'Razorpay Payout ID', type: 'text', maxLength: 120 },
    { name: 'payoutDetails', label: 'Payout Snapshot', type: 'json' },
    { name: 'note', type: 'text', maxLength: 300 },
    { name: 'recordedBy', type: 'relationship', relationTo: 'users' },
  ],
  timestamps: true,
}
