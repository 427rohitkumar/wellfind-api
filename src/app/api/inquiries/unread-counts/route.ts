import { getPayload } from 'payload'
import config from '@/payload.config'
import {  } from '@/lib/auth'
import { canAccessRequest } from '@/lib/permissions'

/**
 * GET /api/inquiries/unread-counts
 * Retrieves persistent unread counts for Student and Teacher enquiries.
 * Authenticated super_admin only.
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

    const unreadCondition: any = {
      or: [
        { markAsRead: { equals: false } },
        { markAsRead: { exists: false } },
      ],
    }

    const teacherUnreadCondition: any = {
      and: [
        unreadCondition,
        {
          applicationStatus: { not_equals: 'approved' },
        },
      ],
    }

    const [studentCountResult, teacherCountResult] = await Promise.all([
      payload.count({
        collection: 'student-enquiries',
        where: unreadCondition,
        overrideAccess: true,
      }),
      payload.count({
        collection: 'teacher-enquiries',
        where: teacherUnreadCondition,
        overrideAccess: true,
      }),
    ])

    const studentUnread = Number(studentCountResult.totalDocs ?? 0)
    const teacherUnread = Number(teacherCountResult.totalDocs ?? 0)
    const totalUnread = studentUnread + teacherUnread

    return Response.json({
      studentUnread,
      teacherUnread,
      totalUnread,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve unread counts.' },
      { status: 500 },
    )
  }
}

