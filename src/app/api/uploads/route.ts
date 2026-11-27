import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { canWrite } from '@/lib/permissions'
import {
  listOwnDocuments,
  uploadAvatar,
  uploadDocument,
  uploadCourseThumbnail,
  uploadCourseVideo,
} from '@/services/uploadService'

/**
 * POST /api/uploads (multipart/form-data) for any signed-in user (admin or teacher).
 *   file     the file
 *   purpose  "avatar" | "document" | "course-thumbnail" | "course-video"
 *            (course purposes also need write access to the `courses` module)
 *   label, category  optional, documents only
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Authenticate before reading the body, so anonymous callers cannot make the server buffer files.
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError('Invalid upload. Send multipart/form-data.', 400)
    }
    const purpose = String(formData.get('purpose') || 'document')

    const isThumbnail = purpose === 'course-thumbnail' || purpose === 'thumbnail'
    const isVideo = purpose === 'course-video' || purpose === 'video'
    if (isThumbnail || isVideo) {
      if (!canWrite(auth.user, 'courses')) return apiError('You do not have access to this area.', 403)
      if (isThumbnail) return apiSuccess(await uploadCourseThumbnail(formData), 'Thumbnail uploaded to Cloudinary successfully.', 201)
      return apiSuccess(await uploadCourseVideo(formData), 'Intro video uploaded to Cloudinary successfully.', 201)
    }

    if (purpose === 'avatar') return apiSuccess(await uploadAvatar(auth.payload, auth.user, formData), 'Profile photo updated.', 201)
    if (purpose === 'document') return apiSuccess(await uploadDocument(auth.payload, auth.user, formData), 'File uploaded.', 201)
    return apiError("purpose must be 'avatar', 'document', 'course-thumbnail', or 'course-video'.", 400, [{ field: 'purpose', message: 'Invalid purpose.' }])
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
