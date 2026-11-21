import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

export const testModes = ['physical', 'digital'] as const
export type TestMode = (typeof testModes)[number]

export const testStatuses = ['requested', 'scheduled', 'conducted', 'report_ready', 'cancelled'] as const
export type TestStatus = (typeof testStatuses)[number]

export const testPaymentStatuses = ['pending', 'paid', 'waived'] as const
export type TestPaymentStatus = (typeof testPaymentStatuses)[number]

/**
 * Wellfind Academic — the optional pre-allocation assessment of a student.
 *
 * Asked for during the enquiry stage (the parent or student chooses to take it; it can be skipped).
 * Two modes: `physical` (a tester visits, fee ₹99) and `digital` (online quiz, fee ₹49).
 * The result is a general profile (IQ, creativity, academic level) used to pick the best teacher
 * and to guide how much effort the teacher should put in.
 *
 * Access: super_admin only. Written through the admin API (services/enquiryTestService).
 */
export const EnquiryTests: CollectionConfig = {
  slug: 'enquiry-tests',
  admin: { useAsTitle: 'mode', defaultColumns: ['studentEnquiry', 'mode', 'status', 'paymentStatus', 'scheduledAt'] },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'tests'),
    read: ({ req: { user } }) => canRead(user, 'tests'),
    update: ({ req: { user } }) => canWrite(user, 'tests'),
    delete: ({ req: { user } }) => canWrite(user, 'tests'),
  },
  fields: [
    { name: 'studentEnquiry', type: 'relationship', relationTo: 'student-enquiries', required: true, index: true },
    { name: 'mode', type: 'select', options: [...testModes], required: true, index: true },
    { name: 'fee', type: 'number', required: true, min: 0, admin: { description: 'Test fee in INR (physical 99, digital 49).' } },
    { name: 'status', type: 'select', options: [...testStatuses], defaultValue: 'requested', required: true, index: true },
    {
      name: 'payment',
      type: 'group',
      fields: [
        { name: 'status', type: 'select', options: [...testPaymentStatuses], defaultValue: 'pending' },
        { name: 'paidAt', type: 'date' },
        { name: 'reference', type: 'text', maxLength: 120 },
        { name: 'note', type: 'text', maxLength: 300 },
      ],
    },
    { name: 'tester', type: 'relationship', relationTo: 'users', admin: { description: 'Person who conducts a physical test.' } },
    { name: 'scheduledAt', type: 'date', index: true },
    { name: 'venue', type: 'text', maxLength: 500, admin: { description: 'Address for a physical test.' } },
    { name: 'schedulingNote', type: 'textarea', maxLength: 1000 },
    { name: 'conductedAt', type: 'date' },
    {
      name: 'report',
      type: 'group',
      fields: [
        { name: 'iqScore', type: 'number', min: 0, max: 100 },
        { name: 'creativityScore', type: 'number', min: 0, max: 100 },
        { name: 'academicScore', type: 'number', min: 0, max: 100 },
        { name: 'strengths', type: 'textarea', maxLength: 2000 },
        { name: 'improvementAreas', type: 'textarea', maxLength: 2000 },
        { name: 'recommendation', type: 'textarea', maxLength: 2000, admin: { description: 'Guidance for the teacher: focus areas and effort needed.' } },
        { name: 'hoursPerWeek', type: 'number', min: 0, max: 40 },
        { name: 'testerNotes', type: 'textarea', maxLength: 2000 },
        { name: 'reportedAt', type: 'date' },
      ],
    },
    {
      name: 'history',
      type: 'array',
      fields: [
        { name: 'type', type: 'text', required: true, maxLength: 60 },
        { name: 'at', type: 'date' },
        { name: 'by', type: 'relationship', relationTo: 'users' },
        { name: 'note', type: 'text', maxLength: 300 },
      ],
    },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
  timestamps: true,
}
