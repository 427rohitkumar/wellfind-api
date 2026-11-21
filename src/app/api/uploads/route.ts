import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { listOwnDocuments, uploadAvatar, uploadDocument } from '@/services/uploadService'

/**
 * POST /api/uploads (multipart/form-data) for any signed-in user (admin or teacher).
 *   file     the file
 *   purpose  "avatar" (profile photo) | "document" (PDF or image, private)
 *   label, category  optional, documents only
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError('Invalid upload. Send multipart/form-data.', 400)
    }
    const purpose = String(formData.get('purpose') || 'document')
    if (purpose === 'avatar') return apiSuccess(await uploadAvatar(auth.payload, auth.user, formData), 'Profile photo updated.', 201)
    if (purpose === 'document') return apiSuccess(await uploadDocument(auth.payload, auth.user, formData), 'File uploaded.', 201)
    return apiError("purpose must be 'avatar' or 'document'.", 400, [{ field: 'purpose', message: 'Invalid purpose.' }])
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to upload the file.')
  }
}

/** GET /api/uploads: the caller's documents (super admins may add ?userId= to see someone else's). */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const userId = Number(new URL(request.url).searchParams.get('userId'))
    return apiSuccess(await listOwnDocuments(auth.payload, auth.user, Number.isInteger(userId) && userId > 0 ? userId : undefined), 'Files fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch files.')
  }
}
