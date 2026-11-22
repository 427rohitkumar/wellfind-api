import { apiError, apiSuccess, handleRouteError, parseJsonObject } from '@/lib/api'
import { getClientIP, rateLimit } from '@/lib/auth'
import { phoneKey } from '@/services/accountDeletionService'
import { notifyStaff } from '@/services/notificationService'
import { getPayload } from 'payload'
import config from '@/payload.config'

const TYPES = ['student_parent', 'teacher', 'other'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * POST /api/data-deletion-requests (public, no sign-in)
 * { fullName?, email?, phone?, requesterType, message?, website? }  ("website" is a honeypot and must stay empty)
 * For students, parents and teachers who cannot (or do not want to) delete from inside the app.
 * A super admin verifies the request and processes it; contact details are scrubbed afterwards.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const limit = rateLimit(`deletion-request:${getClientIP(request.headers)}`, 5)
    if (!limit.allowed) return apiError('Too many requests. Please try again later.', 429)

    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const d = body.data

    // Bots fill hidden fields: pretend it worked.
    if (typeof d.website === 'string' && d.website.trim() !== '') {
      return apiSuccess({ reference: 'received' }, 'Your request has been received.', 201)
    }

    const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : ''
    const phone = typeof d.phone === 'string' ? d.phone.trim() : ''
    const fullName = typeof d.fullName === 'string' ? d.fullName.trim().slice(0, 120) : ''
    const message = typeof d.message === 'string' ? d.message.trim().slice(0, 1000) : ''
    const requesterType = TYPES.includes(d.requesterType as (typeof TYPES)[number]) ? (d.requesterType as (typeof TYPES)[number]) : 'other'

    const errors: { field: string; message: string }[] = []
    if (!email && !phone) errors.push({ field: 'email', message: 'Enter the e-mail or phone number used with Wellfind Academic.' })
    if (email && (!EMAIL_RE.test(email) || email.length > 200)) errors.push({ field: 'email', message: 'Enter a valid e-mail address.' })
    if (phone && phoneKey(phone).length !== 10) errors.push({ field: 'phone', message: 'Enter a valid 10 digit phone number.' })
    if (errors.length) return apiError('Please check the form.', 400, errors)

    const payload = await getPayload({ config })

    // Same person asking twice: reuse the open request.
    const or: Record<string, unknown>[] = []
    if (email) or.push({ email: { equals: email } })
    if (phone) or.push({ phone: { equals: phone } })
    const open = await (payload as any).find({
      collection: 'data-deletion-requests',
      where: { and: [{ status: { equals: 'pending' } }, { source: { equals: 'web' } }, { or }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let doc = open.docs[0]
    if (!doc) {
      doc = await (payload as any).create({
        collection: 'data-deletion-requests',
        data: { source: 'web', requesterType, status: 'pending', fullName, email: email || null, phone: phone || null, message },
        overrideAccess: true,
      })
      void notifyStaff(payload, 'users', {
        type: 'data_deletion_requested',
        entityType: 'data_deletion_request',
        entityId: doc.id,
        title: 'Data deletion request',
        body: 'A user asked for their data to be deleted.',
        dedupeKey: `data-deletion:${doc.id}`,
      })
    }
    return apiSuccess(
      { reference: `DDR-${doc.id}`, completeWithinDays: 30 },
      'Your request has been received. We will verify it and delete your data within 30 days.',
      201,
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to submit the request.')
  }
}
