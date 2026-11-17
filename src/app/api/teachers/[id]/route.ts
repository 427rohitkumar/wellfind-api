import { getPayload } from 'payload'
import config from '@/payload.config'
import { isSuperAdminRole } from '@/lib/auth'

/**
 * GET /api/teachers/:id
 * Retrieve a single teacher profile. super_admin only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    const payload = await getPayload({ config })

    const authResult = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = authResult

    if (!isSuperAdminRole(user)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    const doc = await payload.findByID({
      collection: 'teacher-profiles',
      id,
      depth: 2,
    })

    if (!doc) {
      return Response.json({ error: 'Teacher profile not found.' }, { status: 404 })
    }

    return Response.json(doc)
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve teacher profile.' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/teachers/:id
 * Update a teacher profile. super_admin only.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    const payload = await getPayload({ config })

    const authResult = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = authResult

    if (!isSuperAdminRole(user)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const updated = await payload.update({
      collection: 'teacher-profiles',
      id,
      data: body,
    })

    return Response.json(updated)
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to update teacher profile.' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/teachers/:id
 * Delete a teacher profile. super_admin only.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    const payload = await getPayload({ config })

    const authResult = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = authResult

    if (!isSuperAdminRole(user)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    const deleted = await payload.delete({
      collection: 'teacher-profiles',
      id,
    })

    return Response.json(deleted)
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to delete teacher profile.' },
      { status: 500 },
    )
  }
}

