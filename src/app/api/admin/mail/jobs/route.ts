import { getPayload } from 'payload'
import config from '@/payload.config'
import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireSuperAdmin } from '@/lib/api'
import { runMonthlyPayoutJob, runRegistrationExpiryJob } from '@/services/mailJobs'

/**
 * POST /api/admin/mail/jobs  { job: 'registration_expiry' | 'monthly_payout', month?: 'YYYY-MM' }
 * Runs a scheduled mail job on demand (super_admin) or from a scheduler that sends the
 * `x-cron-secret` header matching the CRON_SECRET environment variable.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const secret = process.env.CRON_SECRET
    const cronOk = Boolean(secret) && request.headers.get('x-cron-secret') === secret
    let payload
    if (cronOk) {
      payload = await getPayload({ config })
    } else {
      const auth = await requireSuperAdmin(request)
      if (!auth.ok) return auth.response
      payload = auth.payload
    }
    const body = await parseJsonObject(request, { allowEmpty: true })
    if (!body.ok) return body.response
    const job = body.data.job
    if (job === 'registration_expiry') {
      return apiSuccess(await runRegistrationExpiryJob(payload), 'Registration expiry reminders processed.')
    }
    if (job === 'monthly_payout') {
      const month = typeof body.data.month === 'string' ? body.data.month : new Date().toISOString().slice(0, 7)
      const result = await runMonthlyPayoutJob(payload, month)
      if (result.details[0] === 'Month must look like 2026-11.') return apiError(result.details[0], 400)
      return apiSuccess(result, 'Monthly payout emails processed.')
    }
    return apiError("Unknown job. Use 'registration_expiry' or 'monthly_payout'.", 400)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to run the mail job.')
  }
}
