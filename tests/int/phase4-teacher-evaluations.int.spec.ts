import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  calculateQualityScoreBreakdown,
  DEFAULT_INTERVIEW_WEIGHT,
  DEFAULT_WRITTEN_TEST_WEIGHT,
  validateCreateEvaluationInput,
  validateEvaluationSectionInput,
  validateEvaluationWeights,
} from '@/lib/teacherEvaluationValidation'
import {
  GET as listTeacherEvaluations,
  POST as createTeacherEvaluation,
} from '@/app/api/teacher-enquiries/[id]/evaluations/route'
import {
  GET as getTeacherEvaluationById,
  PATCH as updateTeacherEvaluation,
} from '@/app/api/teacher-enquiries/[id]/evaluations/[evaluationId]/route'

let payload: any
let adminToken = ''
let secondAdminToken = ''
let teacherToken = ''
let suspendedAdminToken = ''

let adminUser: Record<string, unknown>
let secondAdminUser: Record<string, unknown>
let suspendedAdminUser: Record<string, unknown>
let teacherUser: Record<string, unknown>

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const SECOND_ADMIN_EMAIL = 'phase4-second-admin@example.com'
const TEACHER_EMAIL = 'phase4-teacher@example.com'
const SUSPENDED_ADMIN_EMAIL = 'phase4-suspended-admin@example.com'
const TEST_PASSWORD = 'Phase4UserPass123!'

const createdEnquiryIds: number[] = []
const createdEvaluationIds: number[] = []
const createdProfileIds: number[] = []
const tempUserIds: number[] = []

function jsonRequest(
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Request {
  const init: RequestInit = {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return new Request(`http://localhost:3000${path}`, init)
}

function enquiryCtx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

function evaluationCtx(id: number | string, evaluationId: number | string) {
  return { params: Promise.resolve({ id: String(id), evaluationId: String(evaluationId) }) }
}

async function ensureUserAndToken(
  email: string,
  role: 'super_admin' | 'teacher',
  finalStatus: 'active' | 'suspended',
): Promise<{ user: Record<string, unknown>; token: string }> {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })

  let userDoc: Record<string, unknown>
  if (existing.docs.length > 0) {
    userDoc = await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: {
        role,
        status: 'active',
        password: TEST_PASSWORD,
      },
      overrideAccess: true,
    })
  } else {
    userDoc = await payload.create({
      collection: 'users',
      data: {
        email,
        password: TEST_PASSWORD,
        role,
        status: 'active',
      },
      overrideAccess: true,
    })
    tempUserIds.push(Number(userDoc.id))
  }

  const loginRes = await payload.login({
    collection: 'users',
    data: { email, password: TEST_PASSWORD },
  })

  if (finalStatus === 'suspended') {
    userDoc = await payload.update({
      collection: 'users',
      id: userDoc.id,
      data: { status: 'suspended' },
      overrideAccess: true,
    })
  }

  return { user: userDoc, token: loginRes.token as string }
}

async function createTestTeacherEnquiry(
  suffix: string,
  targetStatus: 'new' | 'under_review' | 'shortlisted' | 'approved' | 'rejected' = 'shortlisted',
): Promise<Record<string, unknown>> {
  const uniqueSuffix = `${suffix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const created = await payload.create({
    collection: 'teacher-enquiries',
    data: {
      fullName: `Phase 4 Teacher ${uniqueSuffix}`,
      mobileNumber: `+91 98765 ${Math.floor(10000 + Math.random() * 89999)}`,
      email: `phase4-${uniqueSuffix}@example.com`,
      highestQualification: 'M.Sc. Mathematics',
      teachingExperience: '6 years',
      primarySubject: 'Mathematics',
      classLevel: 'Class 8–10',
      teachingLocality: 'Salt Lake, Kolkata',
      preferredAvailability: 'Mon–Fri: 4 PM – 8 PM',
      agreedToPolicy: true,
    },
    overrideAccess: true,
  })
  createdEnquiryIds.push(Number(created.id))

  if (targetStatus === 'rejected') {
    return await payload.update({
      collection: 'teacher-enquiries',
      id: created.id,
      data: {
        applicationStatus: 'rejected',
        rejectionCategory: 'qualifications_mismatch',
        changeReason: 'Phase 4 test rejected setup.',
      },
      overrideAccess: true,
    })
  }

  if (targetStatus === 'new') {
    return created
  }

  let current = await payload.update({
    collection: 'teacher-enquiries',
    id: created.id,
    data: { applicationStatus: 'under_review' },
    overrideAccess: true,
  })
  if (targetStatus === 'under_review') {
    return current
  }

  current = await payload.update({
    collection: 'teacher-enquiries',
    id: created.id,
    data: { applicationStatus: 'shortlisted' },
    overrideAccess: true,
  })
  if (targetStatus === 'shortlisted') {
    return current
  }

  current = await payload.update({
    collection: 'teacher-enquiries',
    id: created.id,
    data: { applicationStatus: 'approved', registrationFee: { status: 'paid' } },
    overrideAccess: true,
  })
  const profiles = await payload.find({
    collection: 'teacher-profiles',
    where: { teacherEnquiry: { equals: created.id } },
    overrideAccess: true,
  })
  for (const p of profiles.docs) {
    createdProfileIds.push(Number(p.id))
  }
  return current
}

async function resetGlobalWeightsToDefault(): Promise<void> {
  await payload.updateGlobal({
    slug: 'teacher-evaluation-config',
    data: {
      writtenTestWeight: DEFAULT_WRITTEN_TEST_WEIGHT,
      interviewWeight: DEFAULT_INTERVIEW_WEIGHT,
    },
    overrideAccess: true,
  })
}

describe('Phase 4 — Teacher Evaluation (`FR-C1` to `FR-C3`, `BR-10`, `BR-11`)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    const loginRes = await payload.login({
      collection: 'users',
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    adminToken = loginRes.token as string
    adminUser = loginRes.user as Record<string, unknown>

    const secondAdmin = await ensureUserAndToken(SECOND_ADMIN_EMAIL, 'super_admin', 'active')
    secondAdminUser = secondAdmin.user
    secondAdminToken = secondAdmin.token

    const teacher = await ensureUserAndToken(TEACHER_EMAIL, 'teacher', 'active')
    teacherUser = teacher.user
    teacherToken = teacher.token

    const suspendedAdmin = await ensureUserAndToken(
      SUSPENDED_ADMIN_EMAIL,
      'super_admin',
      'suspended',
    )
    suspendedAdminUser = suspendedAdmin.user
    suspendedAdminToken = suspendedAdmin.token

    await resetGlobalWeightsToDefault()
  })

  afterAll(async () => {
    await resetGlobalWeightsToDefault().catch(() => {})

    for (const id of createdEvaluationIds) {
      await payload
        .delete({ collection: 'teacher-evaluations', id, overrideAccess: true })
        .catch(() => {})
    }
    for (const id of createdProfileIds) {
      await payload
        .delete({ collection: 'teacher-profiles', id, overrideAccess: true })
        .catch(() => {})
    }
    for (const enquiryId of createdEnquiryIds) {
      const remainingProfiles = await payload
        .find({
          collection: 'teacher-profiles',
          where: { teacherEnquiry: { equals: enquiryId } },
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const p of remainingProfiles.docs || []) {
        await payload
          .delete({ collection: 'teacher-profiles', id: p.id, overrideAccess: true })
          .catch(() => {})
      }

      const evals = await payload
        .find({
          collection: 'teacher-evaluations',
          where: { teacherEnquiry: { equals: enquiryId } },
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const ev of evals.docs || []) {
        await payload
          .delete({ collection: 'teacher-evaluations', id: ev.id, overrideAccess: true })
          .catch(() => {})
      }

      const audits = await payload
        .find({
          collection: 'enquiry-audit-log',
          where: { teacherEnquiry: { equals: enquiryId } },
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const a of audits.docs || []) {
        await payload
          .delete({ collection: 'enquiry-audit-log', id: a.id, overrideAccess: true })
          .catch(() => {})
      }

      await payload
        .delete({ collection: 'teacher-enquiries', id: enquiryId, overrideAccess: true })
        .catch(() => {})
    }

    for (const uid of tempUserIds) {
      await payload.delete({ collection: 'users', id: uid, overrideAccess: true }).catch(() => {})
    }
    for (const email of [SECOND_ADMIN_EMAIL, TEACHER_EMAIL, SUSPENDED_ADMIN_EMAIL]) {
      const found = await payload
        .find({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
        .catch(() => ({ docs: [] }))
      for (const u of found.docs || []) {
        await payload
          .delete({ collection: 'users', id: u.id, overrideAccess: true })
          .catch(() => {})
      }
    }
  })

  describe('Unit Validation & Scoring Mathematics (`FR-C1`, `FR-C2`)', () => {
    it('calculates exact PRD formula with default 50/50 weights (75/100 and 80/100 -> 77.5)', () => {
      const result = calculateQualityScoreBreakdown({
        writtenMarksObtained: 75,
        writtenTotalMarks: 100,
        interviewMarksObtained: 80,
        interviewTotalMarks: 100,
        weights: {
          writtenTestWeight: 0.5,
          interviewWeight: 0.5,
        },
      })

      expect(result.writtenPercentage).toBe(75)
      expect(result.interviewPercentage).toBe(80)
      expect(result.qualityScore).toBe(77.5)
    })

    it('calculates weighted percentages accurately across non-100 denominators and custom weights', () => {
      // Written: 36/40 = 90%, Interview: 19/25 = 76%, Weights: 0.70 / 0.30 -> 63 + 22.8 = 85.8
      const result = calculateQualityScoreBreakdown({
        writtenMarksObtained: 36,
        writtenTotalMarks: 40,
        interviewMarksObtained: 19,
        interviewTotalMarks: 25,
        weights: {
          writtenTestWeight: 0.7,
          interviewWeight: 0.3,
        },
      })

      expect(result.writtenPercentage).toBe(90)
      expect(result.interviewPercentage).toBe(76)
      expect(result.qualityScore).toBe(85.8)
    })

    it('rejects negative marks, zero/negative totalMarks, marks > totalMarks, and invalid weights', () => {
      expect(
        validateEvaluationSectionInput({ marksObtained: -1, totalMarks: 100 }, 'writtenTest').ok,
      ).toBe(false)
      expect(
        validateEvaluationSectionInput({ marksObtained: 10, totalMarks: 0 }, 'writtenTest').ok,
      ).toBe(false)
      expect(
        validateEvaluationSectionInput({ marksObtained: 10, totalMarks: -50 }, 'interview').ok,
      ).toBe(false)
      expect(
        validateEvaluationSectionInput({ marksObtained: 101, totalMarks: 100 }, 'interview').ok,
      ).toBe(false)

      expect(validateEvaluationWeights(0.5, 0.5).ok).toBe(true)
      expect(validateEvaluationWeights(0.7, 0.4).ok).toBe(false)
      expect(validateEvaluationWeights(0, 1).ok).toBe(false)
      expect(validateEvaluationWeights(-0.2, 1.2).ok).toBe(false)

      expect(
        validateCreateEvaluationInput({
          writtenTest: { marksObtained: 75, totalMarks: 100 },
          status: 'completed',
        }).ok,
      ).toBe(false)
    })
  })

  describe('Access Control & Authentication Guards (`FR-C1`, `FR-C3`)', () => {
    it('rejects unauthenticated (401), teacher role (403), and suspended admin (403) across evaluation endpoints', async () => {
      const enquiry = await createTestTeacherEnquiry('rbac', 'shortlisted')

      const postPayload = {
        writtenTest: { marksObtained: 70, totalMarks: 100 },
        interview: { marksObtained: 80, totalMarks: 100 },
      }

      // Unauthenticated -> 401
      const unauthPost = await createTeacherEvaluation(
        jsonRequest(`/api/teacher-enquiries/${enquiry.id}/evaluations`, 'POST', {}, postPayload),
        enquiryCtx(enquiry.id as number),
      )
      expect(unauthPost.status).toBe(401)

      const unauthGetList = await listTeacherEvaluations(
        jsonRequest(`/api/teacher-enquiries/${enquiry.id}/evaluations`, 'GET'),
        enquiryCtx(enquiry.id as number),
      )
      expect(unauthGetList.status).toBe(401)

      // Teacher role -> 403
      const teacherPost = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${teacherToken}` },
          postPayload,
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(teacherPost.status).toBe(403)

      const teacherGetList = await listTeacherEvaluations(
        jsonRequest(`/api/teacher-enquiries/${enquiry.id}/evaluations`, 'GET', {
          Authorization: `Bearer ${teacherToken}`,
        }),
        enquiryCtx(enquiry.id as number),
      )
      expect(teacherGetList.status).toBe(403)

      // Suspended admin -> 403
      const suspendedPost = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${suspendedAdminToken}` },
          postPayload,
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(suspendedPost.status).toBe(403)

      // Seed valid evaluation by active admin to test detail & patch RBAC
      const createdRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          postPayload,
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(createdRes.status).toBe(201)
      const createdJson = await createdRes.json()
      const evalId = Number(createdJson.data.id)
      createdEvaluationIds.push(evalId)

      const teacherGetDetail = await getTeacherEvaluationById(
        jsonRequest(`/api/teacher-enquiries/${enquiry.id}/evaluations/${evalId}`, 'GET', {
          Authorization: `Bearer ${teacherToken}`,
        }),
        evaluationCtx(enquiry.id as number, evalId),
      )
      expect(teacherGetDetail.status).toBe(403)

      const teacherPatch = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${evalId}`,
          'PATCH',
          { Authorization: `Bearer ${teacherToken}` },
          { overallRemarks: 'Unauthorized edit', changeReason: 'Tamper test' },
        ),
        evaluationCtx(enquiry.id as number, evalId),
      )
      expect(teacherPatch.status).toBe(403)

      const suspendedPatch = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${evalId}`,
          'PATCH',
          { Authorization: `Bearer ${suspendedAdminToken}` },
          { overallRemarks: 'Suspended edit', changeReason: 'Suspended test' },
        ),
        evaluationCtx(enquiry.id as number, evalId),
      )
      expect(suspendedPatch.status).toBe(403)

      // Active non-admin teacher cannot update central weight config either
      await expect(
        payload.updateGlobal({
          slug: 'teacher-evaluation-config',
          data: { writtenTestWeight: 0.9, interviewWeight: 0.1 },
          user: teacherUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      await expect(
        payload.updateGlobal({
          slug: 'teacher-evaluation-config',
          data: { writtenTestWeight: 0.9, interviewWeight: 0.1 },
          user: suspendedAdminUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  describe('Completed Evaluation Creation, Independence & Non-Auto-Approval (`FR-C1`, `FR-C2`)', () => {
    it('stores writtenTest and interview independently, computes 77.5, sets evaluation_completed without auto-approving/rejecting', async () => {
      const enquiry = await createTestTeacherEnquiry('complete-happy', 'shortlisted')

      const reqBody = {
        writtenTest: {
          marksObtained: 75,
          totalMarks: 100,
          remarks: 'Good subject knowledge.',
        },
        interview: {
          marksObtained: 80,
          totalMarks: 100,
          remarks: 'Good communication and teaching approach.',
        },
        // Attempted client spoofing of score & evaluator must be ignored
        qualityScore: 100,
        evaluator: 999999,
      }

      const res = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          reqBody,
        ),
        enquiryCtx(enquiry.id as number),
      )

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.success).toBe(true)

      const ev = json.data
      createdEvaluationIds.push(Number(ev.id))

      expect(ev.teacherEnquiry).toBe(enquiry.id)
      expect(ev.attemptNumber).toBe(1)
      expect(ev.evaluationStatus).toBe('completed')
      expect(ev.writtenTest).toMatchObject({
        marksObtained: 75,
        totalMarks: 100,
        percentage: 75,
        remarks: 'Good subject knowledge.',
        recordedBy: adminUser.id,
      })
      expect(typeof ev.writtenTest.recordedAt).toBe('string')

      expect(ev.interview).toMatchObject({
        marksObtained: 80,
        totalMarks: 100,
        percentage: 80,
        remarks: 'Good communication and teaching approach.',
        recordedBy: adminUser.id,
      })
      expect(typeof ev.interview.recordedAt).toBe('string')

      expect(ev.appliedWeights).toEqual({
        writtenTestWeight: 0.5,
        interviewWeight: 0.5,
      })
      expect(ev.qualityScore).toBe(77.5)
      expect(ev.evaluator).toBe(adminUser.id)
      expect(typeof ev.evaluatedAt).toBe('string')
      expect(typeof ev.completedAt).toBe('string')

      // Verify application moves to evaluation_completed and NEVER auto-approves or creates TeacherProfile
      const refreshedEnquiry = await payload.findByID({
        collection: 'teacher-enquiries',
        id: enquiry.id,
        overrideAccess: true,
      })
      expect(refreshedEnquiry.applicationStatus).toBe('evaluation_completed')
      expect(refreshedEnquiry.applicationStatus).not.toBe('approved')
      expect(refreshedEnquiry.applicationStatus).not.toBe('rejected')

      const profiles = await payload.find({
        collection: 'teacher-profiles',
        where: { teacherEnquiry: { equals: enquiry.id } },
        overrideAccess: true,
      })
      expect(profiles.totalDocs).toBe(0)

      // Even a very low score (10/100) must NOT auto-reject
      const lowEnquiry = await createTestTeacherEnquiry('low-score', 'shortlisted')
      const lowRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${lowEnquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 10, totalMarks: 100 },
            interview: { marksObtained: 10, totalMarks: 100 },
          },
        ),
        enquiryCtx(lowEnquiry.id as number),
      )
      expect(lowRes.status).toBe(201)
      const lowJson = await lowRes.json()
      createdEvaluationIds.push(Number(lowJson.data.id))
      expect(lowJson.data.qualityScore).toBe(10)

      const lowEnquiryAfter = await payload.findByID({
        collection: 'teacher-enquiries',
        id: lowEnquiry.id,
        overrideAccess: true,
      })
      expect(lowEnquiryAfter.applicationStatus).toBe('evaluation_completed')
    })
  })

  describe('Incomplete Evaluations & Step-by-Step Completion (`FR-C1`, `FR-C3`)', () => {
    it('rejects explicit completion when writtenTest or interview is missing, while allowing in_progress -> PATCH completion', async () => {
      const enquiry = await createTestTeacherEnquiry('partial-step', 'shortlisted')

      // 1. Written test only with explicit completion intent -> 400 rejected
      const badCompleted = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 85, totalMarks: 100 },
            status: 'completed',
          },
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(badCompleted.status).toBe(400)

      // Interview only with markCompleted: true -> 400 rejected
      const badCompleted2 = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            interview: { marksObtained: 90, totalMarks: 100 },
            markCompleted: true,
          },
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(badCompleted2.status).toBe(400)

      // Confirm zero rows saved from failed attempts
      const noneSaved = await payload.find({
        collection: 'teacher-evaluations',
        where: { teacherEnquiry: { equals: enquiry.id } },
        overrideAccess: true,
      })
      expect(noneSaved.totalDocs).toBe(0)

      // 2. Save written test first as in_progress
      const draftRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: {
              marksObtained: 80,
              totalMarks: 100,
              remarks: 'Strong written test.',
            },
          },
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(draftRes.status).toBe(201)
      const draftJson = await draftRes.json()
      const evalId = Number(draftJson.data.id)
      createdEvaluationIds.push(evalId)

      expect(draftJson.data.evaluationStatus).toBe('in_progress')
      expect(draftJson.data.writtenTest.marksObtained).toBe(80)
      expect(draftJson.data.writtenTest.recordedBy).toBe(adminUser.id)
      expect(draftJson.data.interview).toBeNull()
      expect(draftJson.data.qualityScore).toBeNull()
      expect(draftJson.data.completedAt).toBeNull()

      // Application remains shortlisted while evaluation is in_progress
      const midEnquiry = await payload.findByID({
        collection: 'teacher-enquiries',
        id: enquiry.id,
        overrideAccess: true,
      })
      expect(midEnquiry.applicationStatus).toBe('shortlisted')

      // Trying to mark completed before interview exists -> 400
      const failFinishRes = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${evalId}`,
          'PATCH',
          { Authorization: `Bearer ${secondAdminToken}` },
          { status: 'completed' },
        ),
        evaluationCtx(enquiry.id as number, evalId),
      )
      expect(failFinishRes.status).toBe(400)

      // 3. Second admin records interview section via PATCH -> completes evaluation
      const completeRes = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${evalId}`,
          'PATCH',
          { Authorization: `Bearer ${secondAdminToken}` },
          {
            interview: {
              marksObtained: 90,
              totalMarks: 100,
              remarks: 'Clear explanation skills.',
            },
          },
        ),
        evaluationCtx(enquiry.id as number, evalId),
      )
      expect(completeRes.status).toBe(200)
      const completeJson = await completeRes.json()
      const completed = completeJson.data

      expect(completed.evaluationStatus).toBe('completed')
      expect(completed.qualityScore).toBe(85)
      // Preserves independent writtenTest recorder while attributing interview to secondAdmin
      expect(completed.writtenTest.recordedBy).toBe(adminUser.id)
      expect(completed.interview.recordedBy).toBe(secondAdminUser.id)
      expect(completed.evaluator).toBe(adminUser.id)
      expect(completed.lastUpdatedBy).toBe(secondAdminUser.id)
      expect(completed.revisionCount).toBe(1)
      expect(completed.revisionHistory[0].previousStatus).toBe('in_progress')
      expect(completed.revisionHistory[0].newStatus).toBe('completed')

      const doneEnquiry = await payload.findByID({
        collection: 'teacher-enquiries',
        id: enquiry.id,
        overrideAccess: true,
      })
      expect(doneEnquiry.applicationStatus).toBe('evaluation_completed')
    })
  })

  describe('Central Weight Configuration, Recalculation & Non-Silent Overwrite (`FR-C2`, `FR-C3`)', () => {
    it('applies updated central weights on new evaluations and recalculations without silent overwrite', async () => {
      const enquiry = await createTestTeacherEnquiry('weights-recalc', 'shortlisted')

      // Create initial evaluation under default 50/50 weights
      const createRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 75, totalMarks: 100 },
            interview: { marksObtained: 80, totalMarks: 100 },
          },
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(createRes.status).toBe(201)
      const eval1 = (await createRes.json()).data
      createdEvaluationIds.push(Number(eval1.id))
      expect(eval1.qualityScore).toBe(77.5)

      // Silent PATCH on completed evaluation without changeReason MUST fail (400)
      const silentUpdate = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${eval1.id}`,
          'PATCH',
          { Authorization: `Bearer ${adminToken}` },
          {
            interview: { marksObtained: 95, totalMarks: 100 },
          },
        ),
        evaluationCtx(enquiry.id as number, eval1.id),
      )
      expect(silentUpdate.status).toBe(400)

      // Attempting to revert completed -> in_progress or delete section fails
      const downgradeUpdate = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${eval1.id}`,
          'PATCH',
          { Authorization: `Bearer ${adminToken}` },
          {
            evaluationStatus: 'in_progress',
            changeReason: 'Attempt revert',
          },
        ),
        evaluationCtx(enquiry.id as number, eval1.id),
      )
      expect(downgradeUpdate.status).toBe(400)

      const deleteSectionUpdate = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${eval1.id}`,
          'PATCH',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: null,
            changeReason: 'Attempt clear',
          },
        ),
        evaluationCtx(enquiry.id as number, eval1.id),
      )
      expect(deleteSectionUpdate.status).toBe(400)

      // Invalid global weight configuration must be rejected
      await expect(
        payload.updateGlobal({
          slug: 'teacher-evaluation-config',
          data: { writtenTestWeight: 0.7, interviewWeight: 0.4 },
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      // Configure central weights to 60% written / 40% interview
      await payload.updateGlobal({
        slug: 'teacher-evaluation-config',
        data: { writtenTestWeight: 0.6, interviewWeight: 0.4 },
        overrideAccess: true,
      })

      // Update eval1 with explicit changeReason -> recalculates using 60/40 weights & logs history
      // Written 75% * 0.6 = 45; Interview 90/100 (90%) * 0.4 = 36 => 81
      const patchRes = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations/${eval1.id}`,
          'PATCH',
          { Authorization: `Bearer ${secondAdminToken}` },
          {
            interview: { marksObtained: 90, totalMarks: 100, remarks: 'Moderation review score.' },
            changeReason: 'Re-evaluated interview panel rubric after moderation.',
          },
        ),
        evaluationCtx(enquiry.id as number, eval1.id),
      )
      expect(patchRes.status).toBe(200)
      const updated = (await patchRes.json()).data

      expect(updated.qualityScore).toBe(81)
      expect(updated.appliedWeights).toEqual({
        writtenTestWeight: 0.6,
        interviewWeight: 0.4,
      })
      expect(updated.revisionCount).toBe(1)
      expect(updated.revisionHistory[0].previousQualityScore).toBe(77.5)
      expect(updated.revisionHistory[0].newQualityScore).toBe(81)
      expect(updated.revisionHistory[0].previousInterview).toMatchObject({
        marksObtained: 80,
        totalMarks: 100,
      })
      expect(updated.revisionHistory[0].previousAppliedWeights).toEqual({
        writtenTestWeight: 0.5,
        interviewWeight: 0.5,
      })
      expect(updated.revisionHistory[0].changedBy).toBe(secondAdminUser.id)
      expect(updated.revisionHistory[0].changeReason).toBe(
        'Re-evaluated interview panel rubric after moderation.',
      )

      // Check EnquiryAuditLog recorded the evaluation update audit entry
      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        where: {
          and: [
            { teacherEnquiry: { equals: enquiry.id } },
            { fieldChanged: { equals: 'evaluation' } },
          ],
        },
        overrideAccess: true,
      })
      expect(audits.totalDocs).toBe(1)
      expect(audits.docs[0].changeReason).toBe(
        'Re-evaluated interview panel rubric after moderation.',
      )

      // Create second evaluation attempt (#2) -> configured 60/40 weights apply automatically
      // 75/100 (75%) * 0.6 + 80/100 (80%) * 0.4 = 45 + 32 = 77
      const secondAttemptRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 75, totalMarks: 100 },
            interview: { marksObtained: 80, totalMarks: 100 },
          },
        ),
        enquiryCtx(enquiry.id as number),
      )
      expect(secondAttemptRes.status).toBe(201)
      const eval2 = (await secondAttemptRes.json()).data
      createdEvaluationIds.push(Number(eval2.id))
      expect(eval2.attemptNumber).toBe(2)
      expect(eval2.qualityScore).toBe(77)

      // Paginated history preserves BOTH evaluations
      const historyRes = await listTeacherEvaluations(
        jsonRequest(`/api/teacher-enquiries/${enquiry.id}/evaluations?page=1&limit=10`, 'GET', {
          Authorization: `Bearer ${adminToken}`,
        }),
        enquiryCtx(enquiry.id as number),
      )
      expect(historyRes.status).toBe(200)
      const historyJson = await historyRes.json()
      expect(historyJson.data.totalDocs).toBe(2)
      expect(historyJson.data.docs[0].attemptNumber).toBe(2)
      expect(historyJson.data.docs[1].attemptNumber).toBe(1)
      expect(historyJson.data.docs[1].revisionCount).toBe(1)

      // Restore defaults after weight test
      await resetGlobalWeightsToDefault()
    })
  })

  describe('Validation Bounds, State Conflicts, Cross-Enquiry Scoping & Regression Checks', () => {
    it('enforces invalid marks, invalid IDs, 404 scoping, and rejects approved/rejected enquiries', async () => {
      const enquiryA = await createTestTeacherEnquiry('bounds-a', 'shortlisted')
      const enquiryB = await createTestTeacherEnquiry('bounds-b', 'shortlisted')
      const rejectedEnquiry = await createTestTeacherEnquiry('rejected-enq', 'rejected')
      const approvedEnquiry = await createTestTeacherEnquiry('approved-enq', 'approved')

      // Marks > totalMarks
      const overMax = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiryA.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 105, totalMarks: 100 },
            interview: { marksObtained: 50, totalMarks: 100 },
          },
        ),
        enquiryCtx(enquiryA.id as number),
      )
      expect(overMax.status).toBe(400)

      // Negative marks
      const negMarks = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiryA.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 50, totalMarks: 100 },
            interview: { marksObtained: -5, totalMarks: 100 },
          },
        ),
        enquiryCtx(enquiryA.id as number),
      )
      expect(negMarks.status).toBe(400)

      // Invalid path IDs
      const badIdRes = await listTeacherEvaluations(
        jsonRequest('/api/teacher-enquiries/abc/evaluations', 'GET', {
          Authorization: `Bearer ${adminToken}`,
        }),
        enquiryCtx('abc'),
      )
      expect(badIdRes.status).toBe(400)

      // Nonexistent enquiry -> 404
      const missingEnquiryRes = await listTeacherEvaluations(
        jsonRequest('/api/teacher-enquiries/9999999/evaluations', 'GET', {
          Authorization: `Bearer ${adminToken}`,
        }),
        enquiryCtx(9999999),
      )
      expect(missingEnquiryRes.status).toBe(404)

      // Rejected enquiry -> 409
      const rejectedEvalRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${rejectedEnquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 80, totalMarks: 100 },
            interview: { marksObtained: 80, totalMarks: 100 },
          },
        ),
        enquiryCtx(rejectedEnquiry.id as number),
      )
      expect(rejectedEvalRes.status).toBe(409)

      // Approved enquiry -> 409
      const approvedEvalRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${approvedEnquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 80, totalMarks: 100 },
            interview: { marksObtained: 80, totalMarks: 100 },
          },
        ),
        enquiryCtx(approvedEnquiry.id as number),
      )
      expect(approvedEvalRes.status).toBe(409)

      // Create evaluation on B and ensure GET via A's URL returns 404
      const createB = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${enquiryB.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 70, totalMarks: 100 },
            interview: { marksObtained: 70, totalMarks: 100 },
          },
        ),
        enquiryCtx(enquiryB.id as number),
      )
      expect(createB.status).toBe(201)
      const evalB = (await createB.json()).data
      createdEvaluationIds.push(Number(evalB.id))

      const crossScopeGet = await getTeacherEvaluationById(
        jsonRequest(`/api/teacher-enquiries/${enquiryA.id}/evaluations/${evalB.id}`, 'GET', {
          Authorization: `Bearer ${adminToken}`,
        }),
        evaluationCtx(enquiryA.id as number, evalB.id),
      )
      expect(crossScopeGet.status).toBe(404)

      // Valid lifecycle compatibility: evaluation_completed -> approved still syncs TeacherProfile
      const approvedAfterEval = await payload.update({
        collection: 'teacher-enquiries',
        id: enquiryB.id,
        data: { applicationStatus: 'approved', registrationFee: { status: 'paid' } },
        overrideAccess: true,
      })
      expect(approvedAfterEval.applicationStatus).toBe('approved')
      const profilesB = await payload.find({
        collection: 'teacher-profiles',
        where: { teacherEnquiry: { equals: enquiryB.id } },
        overrideAccess: true,
      })
      expect(profilesB.totalDocs).toBe(1)
      createdProfileIds.push(Number(profilesB.docs[0].id))
    })

    it('supports list filters, recalculate flag, pre-shortlist evaluation, and collection immutability guards', async () => {
      const underReviewEnquiry = await createTestTeacherEnquiry('under-review', 'under_review')
      const otherEnquiry = await createTestTeacherEnquiry('other-enq', 'shortlisted')

      // Completed evaluation on under_review application keeps applicationStatus as under_review (no invalid status jump)
      const createCompletedRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${underReviewEnquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 80, totalMarks: 100 },
            interview: { marksObtained: 60, totalMarks: 100 },
          },
        ),
        enquiryCtx(underReviewEnquiry.id as number),
      )
      expect(createCompletedRes.status).toBe(201)
      const evalCompleted = (await createCompletedRes.json()).data
      createdEvaluationIds.push(Number(evalCompleted.id))
      expect(evalCompleted.qualityScore).toBe(70)

      const checkEnquiryStatus = await payload.findByID({
        collection: 'teacher-enquiries',
        id: underReviewEnquiry.id,
        overrideAccess: true,
      })
      expect(checkEnquiryStatus.applicationStatus).toBe('under_review')

      // Add a second in_progress draft evaluation
      const createDraftRes = await createTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${underReviewEnquiry.id}/evaluations`,
          'POST',
          { Authorization: `Bearer ${adminToken}` },
          {
            writtenTest: { marksObtained: 90, totalMarks: 100 },
          },
        ),
        enquiryCtx(underReviewEnquiry.id as number),
      )
      expect(createDraftRes.status).toBe(201)
      const evalDraft = (await createDraftRes.json()).data
      createdEvaluationIds.push(Number(evalDraft.id))

      // Filter list by evaluationStatus
      const filteredCompletedRes = await listTeacherEvaluations(
        jsonRequest(
          `/api/teacher-enquiries/${underReviewEnquiry.id}/evaluations?evaluationStatus=completed`,
          'GET',
          { Authorization: `Bearer ${adminToken}` },
        ),
        enquiryCtx(underReviewEnquiry.id as number),
      )
      expect(filteredCompletedRes.status).toBe(200)
      const filteredJson = await filteredCompletedRes.json()
      expect(filteredJson.data.totalDocs).toBe(1)
      expect(filteredJson.data.docs[0].id).toBe(evalCompleted.id)

      // Invalid evaluationStatus filter -> 400
      const badFilterRes = await listTeacherEvaluations(
        jsonRequest(
          `/api/teacher-enquiries/${underReviewEnquiry.id}/evaluations?evaluationStatus=bogus`,
          'GET',
          { Authorization: `Bearer ${adminToken}` },
        ),
        enquiryCtx(underReviewEnquiry.id as number),
      )
      expect(badFilterRes.status).toBe(400)

      // Recalculate existing completed evaluation after changing central weights (0.25 / 0.75)
      // 80 * 0.25 + 60 * 0.75 = 20 + 45 = 65
      await payload.updateGlobal({
        slug: 'teacher-evaluation-config',
        data: { writtenTestWeight: 0.25, interviewWeight: 0.75 },
        overrideAccess: true,
      })

      const recalcRes = await updateTeacherEvaluation(
        jsonRequest(
          `/api/teacher-enquiries/${underReviewEnquiry.id}/evaluations/${evalCompleted.id}`,
          'PATCH',
          { Authorization: `Bearer ${adminToken}` },
          {
            recalculate: true,
            changeReason: 'Recalculate under updated 25/75 rubric weights.',
          },
        ),
        evaluationCtx(underReviewEnquiry.id as number, evalCompleted.id),
      )
      expect(recalcRes.status).toBe(200)
      const recalcJson = await recalcRes.json()
      expect(recalcJson.data.qualityScore).toBe(65)
      expect(recalcJson.data.revisionCount).toBe(1)
      expect(recalcJson.data.revisionHistory[0].previousQualityScore).toBe(70)
      expect(recalcJson.data.revisionHistory[0].newQualityScore).toBe(65)

      // Direct collection-level immutability guards
      let reassignErr: any = null
      try {
        await payload.update({
          collection: 'teacher-evaluations',
          id: evalCompleted.id,
          data: { teacherEnquiry: otherEnquiry.id },
          overrideAccess: true,
        })
      } catch (err) {
        reassignErr = err
      }
      expect(reassignErr).toBeTruthy()
      expect(reassignErr?.data?.errors?.[0]?.message || reassignErr?.message).toMatch(
        /cannot be modified/i,
      )

      let truncateErr: any = null
      try {
        await payload.update({
          collection: 'teacher-evaluations',
          id: evalCompleted.id,
          data: { revisionHistory: [] },
          overrideAccess: true,
        })
      } catch (err) {
        truncateErr = err
      }
      expect(truncateErr).toBeTruthy()
      expect(truncateErr?.data?.errors?.[0]?.message || truncateErr?.message).toMatch(
        /cannot be deleted or truncated/i,
      )

      await resetGlobalWeightsToDefault()
    })
  })
})
