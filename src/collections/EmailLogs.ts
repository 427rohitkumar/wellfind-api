import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

export const emailLogStatuses = ['queued', 'sent', 'failed', 'skipped'] as const
export type EmailLogStatus = (typeof emailLogStatuses)[number]

/**
 * Wellfind Academic — one row per outgoing email (sent, failed or skipped).
 * Written by the mail service only; administrators read it in the Mail tab.
 * Secrets (passwords, OTPs) are never stored: templates declare their sensitive
 * keys and those are removed from `templateData` before saving.
 */
export const EmailLogs: CollectionConfig = {
  slug: 'email-logs',
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['recipient', 'template', 'status', 'createdAt'],
  },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'mail'),
    read: ({ req: { user } }) => canRead(user, 'mail'),
    update: ({ req: { user } }) => canWrite(user, 'mail'),
    delete: ({ req: { user } }) => canWrite(user, 'mail'),
  },
  fields: [
    { name: 'recipient', type: 'text', required: true, index: true, maxLength: 320 },
    { name: 'recipientName', type: 'text', maxLength: 200 },
    { name: 'template', type: 'text', required: true, index: true, maxLength: 80 },
    { name: 'subject', type: 'text', required: true, maxLength: 300 },
    {
      name: 'status',
      type: 'select',
      options: [...emailLogStatuses],
      defaultValue: 'queued',
      required: true,
      index: true,
    },
    { name: 'error', type: 'textarea', maxLength: 2000 },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'messageId', type: 'text', maxLength: 300 },
    { name: 'sentAt', type: 'date' },
    { name: 'relatedType', type: 'text', maxLength: 60, index: true },
    { name: 'relatedId', type: 'text', maxLength: 60, index: true },
    { name: 'dedupeKey', type: 'text', maxLength: 200, index: true },
    {
      name: 'retryable',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'False when the email carried credentials that are not stored.' },
    },
    { name: 'templateData', type: 'json' },
  ],
  timestamps: true,
}
