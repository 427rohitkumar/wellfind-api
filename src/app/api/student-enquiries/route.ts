import { getPayload } from 'payload'
import config from '@/payload.config'

import { getClientIP, isSuperAdminRole, rateLimit } from '@/lib/auth'
import { validateAndBuildEnquiryData } from '@/lib/studentValidation'
import {
  serializeAdminEnquiry,
  serializePublicEnquiry,
} from '@/services/studentService'

// Rate limit for the public submission endpoint: 15 requests per IP per window
// (window length is defined in @/lib/auth, 15 minutes by default).
const SUBMISSION_RATE_LIMIT = 15

/**
 * Parses the Payload `where` query parameter (JSON string) and merges optional
 * convenience filters (`enquiryStatus`, `enquirySource`, `unread`) into it.
 */
function parseWhere(url: URL): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  const whereParam = url.searchParams.get('where')
  if (whereParam) {
    try {
      const parsed = JSON.parse(whereParam)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(where, parsed)
      }
    } catch {
      // Ignore malformed `where` parameters — Payload would reject them anyway.
    }
  }

  const enquiryStatus = url.searchParams.get('enquiryStatus')
  if (enquiryStatus) {
    where.enquiryStatus = { equals: enquiryStatus }
  }

  const enquirySource = url.searchParams.get('enquirySource')
  if (enquirySource) {
    where.enquirySource = { equals: enquirySource }
  }

  const unreadParam = url.searchParams.get('unread')
  if (unreadParam === 'true') {
    where.or = [
      { markAsRead: { equals: false } },
      { markAsRead: { exists: false } },
    ]
  }

  return where
}

/**
 * POST /api/student-enquiries
 * Public enquiry submission.
 * Rate-limited by IP. Validates and sanitizes all incoming fields. Internal
 * management fields are stripped before storage and never returned in the response.
 * Requires `agreedToPolicy: true`.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request.headers)
  const limit = rateLimit(`student-enquiries:create:${ip}`, SUBMISSION_RATE_LIMIT)
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many enquiry submissions. Please try again later.' },
      { status: 429 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const validated = validateAndBuildEnquiryData(body, {
    requireExplicitPolicy: true,
    defaultSource: 'website',
    forceWebsiteSource: true,
  })
  if (!validated.ok) {
    return Response.json({ error: validated.message }, { status: 400 })
  }

  try {
    const payload = await getPayload({ config })
    const created = await (payload as any).create({
      collection: 'student-enquiries',
      data: validated.data,
    })

    return Response.json(
      {
        message: 'Enquiry submitted successfully.',
        enquiry: serializePublicEnquiry(created as unknown as Record<string, unknown>),
      },
      { status: 201 },
    )
  } catch (err: unknown) {
    // Payload field validation errors (e.g. maxLength, required) surface here.
    const payloadError = err as { errors?: unknown[]; message?: string }
    if (Array.isArray(payloadError.errors) && payloadError.errors.length > 0) {
      return Response.json(
        { error: 'Validation failed.', errors: payloadError.errors },
        { status: 400 },
      )
    }
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to submit enquiry.' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/student-enquiries
 * List enquiries. super_admin only.
 * Supports Payload query parameters: limit, page, sort, where (JSON), plus
 * convenience filters ?enquiryStatus=<status> and ?enquirySource=<source>.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    const authResult = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = authResult

    if (!isSuperAdminRole(user)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100)
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
    const sort = url.searchParams.get('sort') || '-createdAt'
    const where: any = parseWhere(url)

    const result = await payload.find({
      collection: 'student-enquiries',
      limit,
      page,
      sort,
      where,
    })

    const docs = (result.docs as unknown[]).map((doc) =>
      serializeAdminEnquiry(doc as unknown as Record<string, unknown>),
    )

    return Response.json({
      docs,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      limit: result.limit,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to list enquiries.' },
      { status: 500 },
    )
  }
}