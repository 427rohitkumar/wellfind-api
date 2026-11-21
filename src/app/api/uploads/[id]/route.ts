import { apiSuccess, authorizeRouteWithId, handleRouteError } from '@/lib/api'
import { deleteOwnDocument } from '@/services/uploadService'

/** DELETE /api/uploads/:id: deletes one of the caller's documents. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const auth = await authorizeRouteWithId(request, context, { field: 'id', label: 'file', requireAdmin: false })
    if (!auth.ok) return auth.response
    return apiSuccess(await deleteOwnDocument(auth.payload, auth.user, auth.entityId), 'File deleted.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to delete the file.')
  }
}
