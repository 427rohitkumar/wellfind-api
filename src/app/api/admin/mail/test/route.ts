import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireSuperAdmin } from '@/lib/api'
import { isValidEmail } from '@/lib/studentValidation'
import { sendTestEmail } from '@/services/mailService'

/** POST /api/admin/mail/test  { to } — sends a test email so the SMTP settings can be checked. */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const to = typeof body.data.to === 'string' ? body.data.to.trim() : ''
    if (!isValidEmail(to)) return apiError('Enter a valid email address.', 400, [{ field: 'to', message: 'Invalid email address.' }])
    const result = await sendTestEmail({ payload: auth.payload, to, sentBy: auth.user.email })
    return apiSuccess(result, result.ok ? 'Test email sent.' : 'The test email was not delivered.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to send the test email.')
  }
}
