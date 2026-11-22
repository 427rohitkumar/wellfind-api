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
      const enqRes = await (auth.payload as any).find({
        collection: 'teacher-enquiries',
        where: {
          or: [
            { teacherUser: { equals: auth.user.id } },
            { email: { equals: auth.user.email } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const enq = enqRes.docs[0] as Record<string, any> | undefined
      if (enq) {
        const regFee = (enq.registrationFee ?? {}) as Record<string, unknown>
        return apiSuccess(
          {
            id: enq.id,
            name: enq.fullName,
            email: enq.email ?? auth.user.email ?? null,
            mobile: enq.mobileNumber ?? null,
            avatar: (auth.user as any).avatar ?? null,
            gender: enq.gender ?? null,
            about: enq.additionalNotes ?? null,
            primarySubject: enq.primarySubject ?? null,
            qualification: enq.highestQualification ?? null,
            experienceYears: enq.teachingExperience ?? 0,
            classLevels: enq.classLevel ?? null,
            locality: enq.teachingLocality ?? null,
            availability: enq.preferredAvailability ?? null,
            availabilityStatus: 'free',
            approvalStatus: enq.applicationStatus ?? 'under_review',
            status: enq.applicationStatus ?? 'under_review',
            approvedAt: null,
            registrationFee: {
              status: regFee.status ?? 'pending',
              amount: regFee.amount ?? 1000,
              currency: 'INR',
              year: null,
              paymentDate: regFee.paymentDate ?? null,
              transactionRef: regFee.transactionRef ?? null,
            },
            kycStatus: enq.aadhaarDocument ? 'uploaded' : 'pending',
            createdAt: enq.createdAt,
            updatedAt: enq.updatedAt,
          },
          'Teacher applicant profile summary fetched.',
        )
      }

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
        gender: p.gender ?? null,
        about: p.about ?? null,
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
