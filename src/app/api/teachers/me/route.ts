import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { findTeacherProfileForUser } from '@/services/teacherAllocationService'

/**
 * GET /api/teachers/me — the logged-in teacher's own profile summary.
 * Identity is derived from the authenticated user (no id accepted). Returns only
 * teacher-safe fields: no KYC documents, review notes, evaluation internals or admin data.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (auth.user.role !== 'teacher') {
      return apiError('Teacher access required.', 403)
    }
    const p = await findTeacherProfileForUser(auth.payload, auth.user.id)
    if (!p) {
      return apiError('No teacher profile is linked to this account.', 403)
    }
    const fee = (p.registrationFee ?? {}) as Record<string, unknown>
    const kyc = (p.kyc ?? {}) as Record<string, unknown>
    return apiSuccess(
      {
        id: p.id,
        name: p.name,
        email: p.email ?? auth.user.email ?? null,
        mobile: p.mobile ?? null,
        avatar: p.avatar ?? null,
        primarySubject: p.primarySubject ?? null,
        qualification: p.qualification ?? null,
        experienceYears: p.experienceYears ?? 0,
        classLevels: p.classLevels ?? null,
        locality: p.locality ?? null,
        availability: p.availability ?? null,
        availabilityStatus: p.availabilityStatus ?? 'free',
        approvalStatus: p.approvalStatus ?? null,
        status: p.status ?? null,
        approvedAt: p.approvedAt ?? null,
        registrationFee: {
          status: fee.status ?? 'pending',
          amount: fee.amount ?? null,
          currency: fee.currency ?? 'INR',
          year: fee.year ?? null,
          paymentDate: fee.paymentDate ?? null,
          transactionRef: fee.transactionRef ?? null,
        },
        kycStatus: kyc.status ?? null,
        createdAt: p.createdAt,
      },
      'Your teacher profile fetched successfully.',
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch your teacher profile.')
  }
}
