import { apiError, apiSuccess, handleRouteError } from '@/lib/api'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { uploadOwnDocuments } from '@/services/teacherApplicationService'

/**
 * POST /api/teacher-applications/me/documents (multipart/form-data)
 * Fields: aadhaarDocument and/or qualificationDocument (PDF/JPG/PNG, max 5 MB each).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError('Invalid upload. Send multipart/form-data.', 400)
    }
    const result = await uploadOwnDocuments(auth.payload, auth.user, formData)
    return apiSuccess(result, 'Documents uploaded successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to upload documents.')
  }
}
