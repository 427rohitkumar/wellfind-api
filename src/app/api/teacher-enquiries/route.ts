import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { getClientIP, isSuperAdminRole, rateLimit } from '@/lib/auth'
import {
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_SIZE_BYTES,
  normalizeTeacherPhoneNumber,
  isValidTeacherPhoneNumber,
} from '@/collections/TeacherEnquiries'

// Rate limit for the public application endpoint: 10 requests per IP per window
// (window length is defined in @/lib/auth, 15 minutes by default).
const APPLICATION_RATE_LIMIT = 10

// Document fields accepted from a public application submission.
const DOCUMENT_FIELDS = ['aadhaarDocument', 'qualificationDocument'] as const

/**
 * Returns only the public form fields of a teacher application document.
 * Private document references and internal management fields are never
 * returned to public callers.
 */
function pickPublicTeacherFields(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc.id,
    fullName: doc.fullName,
    mobileNumber: doc.mobileNumber,
    email: doc.email,
    highestQualification: doc.highestQualification,
    teachingExperience: doc.teachingExperience,
    primarySubject: doc.primarySubject,
    classLevel: doc.classLevel,
    teachingLocality: doc.teachingLocality,
    preferredAvailability: doc.preferredAvailability,
    additionalNotes: doc.additionalNotes,
    agreedToPolicy: doc.agreedToPolicy,
    createdAt: doc.createdAt,
  }
}

function pickAdminTeacherFields(doc: Record<string, unknown>): Record<string, unknown> {
  const base = pickPublicTeacherFields(doc)
  return {
    ...base,
    applicationStatus: doc.applicationStatus || 'new',
    markAsRead: Boolean(doc.markAsRead),
    adminNotes: doc.adminNotes || null,
    teacherAvailability: doc.teacherAvailability || null,
    teacherProfile: doc.teacherProfile || null,
    reviewedBy: doc.reviewedBy || null,
    reviewedAt: doc.reviewedAt || null,
  }
}

/**
 * Parses the Payload `where` query parameter (JSON string) and merges an
 * optional convenience `applicationStatus` filter into it.
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

  const applicationStatus = url.searchParams.get('applicationStatus')
  if (applicationStatus) {
    where.applicationStatus = { equals: applicationStatus }
  }

  const excludeApproved = url.searchParams.get('excludeApproved')
  if (excludeApproved === 'true' && !applicationStatus && !where.applicationStatus) {
    where.applicationStatus = { not_equals: 'approved' }
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
 * Extracts a text field from FormData, trimming whitespace.
 */
function getTextField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name)
  if (value === null || value === undefined) {
    return undefined
  }
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Extracts an uploaded file from FormData, or null if none was provided.
 */
function getUploadedFile(formData: FormData, name: string): File | null {
  const value = formData.get(name)
  if (!(value instanceof File)) {
    return null
  }
  return value
}


/**
 * POST /api/teacher-enquiries
 * Public teacher application submission (multipart/form-data).
 * Rate-limited by IP. Validates and sanitizes all incoming fields. Private KYC
 * documents are uploaded server-side via Payload's local API and linked to the
 * application; they are never exposed to the public caller.
 * Requires `agreedToPolicy: true`. Does not create a user account or assign a role.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request.headers)
  const limit = rateLimit(`teacher-enquiries:create:${ip}`, APPLICATION_RATE_LIMIT)
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many application submissions. Please try again later.' },
      { status: 429 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const fullName = getTextField(formData, 'fullName')
  const mobileNumber = getTextField(formData, 'mobileNumber')
  const email = getTextField(formData, 'email')
  const highestQualification = getTextField(formData, 'highestQualification')
  const teachingExperience = getTextField(formData, 'teachingExperience')
  const primarySubject = getTextField(formData, 'primarySubject')
  const classLevel = getTextField(formData, 'classLevel')
  const teachingLocality = getTextField(formData, 'teachingLocality')
  const preferredAvailability = getTextField(formData, 'preferredAvailability')
  const additionalNotes = getTextField(formData, 'additionalNotes')

  // Required string fields
  const requiredFields: [string, string | undefined][] = [
    ['fullName', fullName],
    ['mobileNumber', mobileNumber],
    ['highestQualification', highestQualification],
    ['teachingExperience', teachingExperience],
    ['primarySubject', primarySubject],
    ['classLevel', classLevel],
    ['teachingLocality', teachingLocality],
    ['preferredAvailability', preferredAvailability],
  ]
  for (const [fieldName, value] of requiredFields) {
    if (!value) {
      return Response.json({ error: `${fieldName} is required.` }, { status: 400 })
    }
  }

  // Mobile number — international-agnostic format
  if (!isValidTeacherPhoneNumber(mobileNumber)) {
    return Response.json(
      {
        error: 'Invalid mobile number. Provide 7–15 digits with an optional leading +.',
      },
      { status: 400 },
    )
  }

  // Optional email length
  if (email !== undefined && email.length > 200) {
    return Response.json(
      { error: 'Email must be at most 200 characters.' },
      { status: 400 },
    )
  }

  // agreedToPolicy must be explicitly true ("true" or "on" from a checkbox)
  const agreedToPolicyRaw = formData.get('agreedToPolicy')
  const agreedToPolicy = agreedToPolicyRaw === 'true' || agreedToPolicyRaw === 'on'
  if (agreedToPolicy !== true) {
    return Response.json(
      { error: 'You must agree to the policy to submit an application.' },
      { status: 400 },
    )
  }

  // Upload and validate private documents server-side.
  const documentIds: Record<string, number | null> = {
    aadhaarDocument: null,
    qualificationDocument: null,
  }

  try {
    const payload = await getPayload({ config })

    for (const fieldName of DOCUMENT_FIELDS) {
      const file = getUploadedFile(formData, fieldName)
      if (file === null) {
        continue
      }

      // Validate MIME type
      if (!isAllowedDocumentMimeType(file.type)) {
        return Response.json(
          {
            error: `Invalid file type for ${fieldName}. Allowed types: PDF, JPG, PNG.`,
          },
          { status: 400 },
        )
      }

      // Validate file size
      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        return Response.json(
          {
            error: `File too large for ${fieldName}. Maximum size is 5 MB.`,
          },
          { status: 400 },
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const document = await (payload as any).create({
        collection: 'teacher-documents',
        data: { alt: file.name },
        file: {
          data: buffer,
          name: file.name,
          mimetype: file.type,
          size: buffer.length,
        },
      })

      documentIds[fieldName as keyof typeof documentIds] = document.id
    }

    // Create the application. Internal management fields are not included —
    // they default server-side and are managed by administrators only.
    const created = await (payload as any).create({
      collection: 'teacher-enquiries',
      data: {
        fullName,
        mobileNumber: normalizeTeacherPhoneNumber(mobileNumber),
        email,
        highestQualification,
        teachingExperience,
        primarySubject,
        classLevel,
        teachingLocality,
        preferredAvailability,
        additionalNotes,
        agreedToPolicy: true,
        aadhaarDocument: documentIds.aadhaarDocument,
        qualificationDocument: documentIds.qualificationDocument,
      },
    })

    return Response.json(
      {
        message: 'Application submitted successfully.',
        application: pickPublicTeacherFields(created as unknown as Record<string, unknown>),
      },
      { status: 201 },
    )
  } catch (err: unknown) {
    const payloadError = err as { errors?: unknown[]; message?: string }
    if (Array.isArray(payloadError.errors) && payloadError.errors.length > 0) {
      return Response.json(
        { error: 'Validation failed.', errors: payloadError.errors },
        { status: 400 },
      )
    }
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to submit application.' },
      { status: 500 },
    )
  }
}


/**
 * GET /api/teacher-enquiries
 * List applications. super_admin only.
 * Supports Payload query parameters: limit, page, sort, where (JSON), plus the
 * convenience filter ?applicationStatus=<status>.
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
      collection: 'teacher-enquiries',
      limit,
      page,
      sort,
      where,
    })

    const docs = (result.docs as unknown[]).map((doc) =>
      pickAdminTeacherFields(doc as unknown as Record<string, unknown>),
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
      { error: err instanceof Error ? err.message : 'Failed to list applications.' },
      { status: 500 },
    )
  }
}