import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { createTeacherAccount } from '@/services/teacherAccountService'

/**
 * POST /api/teacher-enquiries/:id/create-account
 * Body: { email?: string, password?: string } — both optional. The email defaults to the
 * application email; a random alphanumeric password is generated when none is supplied.
 * Creates the teacher login and emails the credentials when SMTP is configured
 * (`super_admin` only).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, {
      field: 'teacherEnquiryId',
      label: 'teacher enquiry',
    })
    if (!pre.ok) return pre.response
    const body = await parseJsonObject(request, { allowEmpty: true })
    if (!body.ok) return body.response
    const result = await createTeacherAccount(pre.payload, pre.entityId, body.data, pre.user)
    return apiSuccess(result, 'Teacher account created successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to create teacher account.')
  }
}
