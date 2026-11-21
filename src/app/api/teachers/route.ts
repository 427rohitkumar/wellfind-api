import { getPayload } from 'payload'
import config from '@/payload.config'
import {  } from '@/lib/auth'
import { canAccessRequest } from '@/lib/permissions'
import { syncApprovedTeacherProfile } from '@/collections/TeacherEnquiries'

/**
 * GET /api/teachers
 * List approved teacher profiles. super_admin only.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    const authResult = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = authResult

    if (!canAccessRequest(user, request)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    // Auto-sync check: Ensure any approved enquiries have a corresponding TeacherProfile
    try {
      const approvedEnquiries = await payload.find({
        collection: 'teacher-enquiries',
        where: {
          applicationStatus: { equals: 'approved' },
        },
        limit: 100,
        overrideAccess: true,
      })

      for (const enquiryDoc of approvedEnquiries.docs) {
        await syncApprovedTeacherProfile(payload, enquiryDoc as any)
      }
    } catch (syncErr) {
      console.warn('Auto-sync approved teacher profiles warning:', syncErr)
    }

    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
    const sort = url.searchParams.get('sort') || '-createdAt'

    const where: any = {}
    const whereParam = url.searchParams.get('where')
    if (whereParam) {
      try {
        const parsed = JSON.parse(whereParam)
        if (parsed && typeof parsed === 'object') {
          Object.assign(where, parsed)
        }
      } catch {
        // Ignore malformed where
      }
    }

    // Always enforce approved status for teachers module
    if (!where.approvalStatus) {
      where.approvalStatus = { equals: 'approved' }
    }

    const result = await payload.find({
      collection: 'teacher-profiles',
      limit,
      page,
      sort,
      where,
      depth: 1,
    })

    return Response.json({
      docs: result.docs,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      limit: result.limit,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to list teachers.' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/teachers
 * Create a new teacher profile directly. super_admin only.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    const authResult = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = authResult

    if (!canAccessRequest(user, request)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const created = await payload.create({
      collection: 'teacher-profiles',
      data: {
        ...body,
        approvalStatus: body.approvalStatus || 'approved',
      },
    })

    return Response.json(created, { status: 201 })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create teacher profile.' },
      { status: 500 },
    )
  }
}
