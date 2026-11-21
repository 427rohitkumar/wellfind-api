import { getPayload } from 'payload'
import config from '@/payload.config'
import {  } from '@/lib/auth'
import { canAccessRequest } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function handleMarkAsRead(request: Request, context: RouteContext): Promise<Response> {
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

    const { id } = await context.params
    const enquiryId = Number(id)
    if (isNaN(enquiryId) || enquiryId <= 0) {
      return Response.json({ error: 'Invalid student enquiry ID.' }, { status: 400 })
    }

    const existing = await payload.findByID({
      collection: 'student-enquiries',
      id: enquiryId,
      overrideAccess: true,
    })

    if (!existing) {
      return Response.json({ error: 'Student enquiry not found.' }, { status: 404 })
    }

    // Idempotency: if already marked as read, do not re-update or alter state
    if (existing.markAsRead === true) {
      return Response.json({
        success: true,
        message: 'Student enquiry is already marked as read.',
        id: enquiryId,
        markAsRead: true,
        wasAlreadyRead: true,
      })
    }

    // Persist markAsRead = true
    const updated = await payload.update({
      collection: 'student-enquiries',
      id: enquiryId,
      data: {
        markAsRead: true,
      },
      overrideAccess: true,
    })

    return Response.json({
      success: true,
      message: 'Student enquiry marked as read successfully.',
      id: updated.id,
      markAsRead: true,
      wasAlreadyRead: false,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to mark enquiry as read.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleMarkAsRead(request, context)
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handleMarkAsRead(request, context)
}

