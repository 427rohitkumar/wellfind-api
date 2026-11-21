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
      return Response.json({ error: 'Invalid teacher enquiry ID.' }, { status: 400 })
    }

    const existing = await payload.findByID({
      collection: 'teacher-enquiries',
      id: enquiryId,
      overrideAccess: true,
    })

    if (!existing) {
      return Response.json({ error: 'Teacher application not found.' }, { status: 404 })
    }

    // Idempotency: if already marked as read, do not re-update or alter state
    if (existing.markAsRead === true) {
      return Response.json({
        success: true,
        message: 'Teacher application is already marked as read.',
        id: enquiryId,
        markAsRead: true,
        wasAlreadyRead: true,
      })
    }

    // Persist markAsRead = true
    const updated = await payload.update({
      collection: 'teacher-enquiries',
      id: enquiryId,
      data: {
        markAsRead: true,
      },
      overrideAccess: true,
    })

    return Response.json({
      success: true,
      message: 'Teacher application marked as read successfully.',
      id: updated.id,
      markAsRead: true,
      wasAlreadyRead: false,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to mark application as read.' },
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

