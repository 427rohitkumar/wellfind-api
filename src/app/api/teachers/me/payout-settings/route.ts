import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { findTeacherProfileForUser } from '@/services/teacherAllocationService'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinaryAdapter'

export const dynamic = 'force-dynamic'

/**
 * GET /api/teachers/me/payout-settings
 * Fetches the logged-in teacher's payout settings (bank accounts and UPI IDs).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (auth.user.role !== 'teacher' && auth.user.role !== 'super_admin' && auth.user.role !== 'staff') {
      return apiError('Teacher access required.', 403)
    }

    // Try finding TeacherProfile
    const profile = await findTeacherProfileForUser(auth.payload, auth.user.id)
    if (profile && (profile as any).payoutSettings) {
      return apiSuccess((profile as any).payoutSettings, 'Payout settings fetched successfully.')
    }

    // If not found or empty, search TeacherEnquiries (for applicant teachers)
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
    if (enq && enq.payoutSettings) {
      return apiSuccess(enq.payoutSettings, 'Payout settings fetched successfully.')
    }

    return apiSuccess({ methods: [], primaryId: null }, 'No payout settings configured yet.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch payout settings.')
  }
}

/**
 * POST /api/teachers/me/payout-settings
 * Saves the teacher's payout accounts (Bank and UPI).
 * If a QR code or passbook image is provided as a Base64 data URL,
 * it is automatically uploaded to Cloudinary, and the Cloudinary HTTPS URL is persisted.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (auth.user.role !== 'teacher' && auth.user.role !== 'super_admin' && auth.user.role !== 'staff') {
      return apiError('Teacher access required.', 403)
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON payload.', 400)
    }

    const rawMethods = Array.isArray(body?.methods) ? body.methods : []
    const primaryId = body?.primaryId || null

    const processedMethods = []
    for (const m of rawMethods) {
      const item = { ...m }

      // Check if QR code is a Base64 Data URL or needs Cloudinary upload
      if (
        typeof item.qrCodeUrl === 'string' &&
        (item.qrCodeUrl.startsWith('data:image/') || item.qrCodeUrl.startsWith('data:application/'))
      ) {
        if (isCloudinaryConfigured()) {
          try {
            const uploadRes = await uploadToCloudinary(item.qrCodeUrl, {
              folder: `wellfind/payout-qr/${auth.user.id}`,
              publicId: `qr_${item.id || Date.now()}`,
              resourceType: 'image',
            })
            item.qrCodeUrl = uploadRes.secureUrl
          } catch (uploadErr) {
            console.error('[Cloudinary] Failed to upload QR code to Cloudinary:', uploadErr)
          }
        }
      }

      // Also check any passbook / proof document
      if (
        typeof item.passbookUrl === 'string' &&
        (item.passbookUrl.startsWith('data:image/') || item.passbookUrl.startsWith('data:application/'))
      ) {
        if (isCloudinaryConfigured()) {
          try {
            const uploadRes = await uploadToCloudinary(item.passbookUrl, {
              folder: `wellfind/payout-docs/${auth.user.id}`,
              publicId: `passbook_${item.id || Date.now()}`,
              resourceType: 'image',
            })
            item.passbookUrl = uploadRes.secureUrl
          } catch (uploadErr) {
            console.error('[Cloudinary] Failed to upload passbook to Cloudinary:', uploadErr)
          }
        }
      }

      processedMethods.push(item)
    }

    const finalSettings = {
      methods: processedMethods,
      primaryId: primaryId || processedMethods.find((m) => m.isPrimary)?.id || processedMethods[0]?.id || null,
      lastSavedAt: new Date().toISOString(),
    }

    // Find and update TeacherProfile
    const profile = await findTeacherProfileForUser(auth.payload, auth.user.id)
    if (profile) {
      await (auth.payload as any).update({
        collection: 'teacher-profiles',
        id: profile.id,
        data: {
          payoutSettings: finalSettings,
        },
        overrideAccess: true,
      })
    }

    // Also find and update TeacherEnquiry (if present)
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
      await (auth.payload as any).update({
        collection: 'teacher-enquiries',
        id: enq.id,
        data: {
          payoutSettings: finalSettings,
        },
        overrideAccess: true,
      })
    }

    if (!profile && !enq) {
      return apiError('No teacher profile or application found for this account.', 404)
    }

    return apiSuccess(finalSettings, 'Payout settings saved and synced successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to save payout settings.')
  }
}
