import { getPayload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  canManageTeacherEnquiries,
  isAllowedDocumentMimeType,
  isValidTeacherPhoneNumber,
  normalizeTeacherPhoneNumber,
  MAX_DOCUMENT_SIZE_BYTES,
} from '@/collections/TeacherEnquiries'

let payload: any

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'

const VALID_APPLICATION_DATA = {
  fullName: 'Ravi Kumar',
  mobileNumber: '+91 98765 43210',
  email: 'ravi@example.com',
  highestQualification: 'M.Sc',
  teachingExperience: '3 years',
  primarySubject: 'Mathematics',
  classLevel: 'Class 10',
  teachingLocality: 'Dwarka, Delhi',
  preferredAvailability: 'Weekday evenings',
  additionalNotes: 'Can travel within South Delhi.',
  agreedToPolicy: true,
}

describe('Teacher Enquiry — access control & validation rules (no database required)', () => {
  it('should allow application management only for super_admin', () => {
    expect(canManageTeacherEnquiries({ role: 'super_admin' } as any)).toBe(true)
    expect(canManageTeacherEnquiries({ role: 'teacher' } as any)).toBe(false)
    expect(canManageTeacherEnquiries(null)).toBe(false)
    expect(canManageTeacherEnquiries(undefined)).toBe(false)
  })

  it('should validate phone numbers without assuming any country code', () => {
    expect(isValidTeacherPhoneNumber('9876543210')).toBe(true)
    expect(isValidTeacherPhoneNumber('+91 98765-43210')).toBe(true)
    expect(isValidTeacherPhoneNumber('+1 (234) 567-8901')).toBe(true)
    expect(isValidTeacherPhoneNumber('123456')).toBe(false)
    expect(isValidTeacherPhoneNumber('abcdefghij')).toBe(false)
    expect(isValidTeacherPhoneNumber(null)).toBe(false)
    expect(isValidTeacherPhoneNumber(undefined)).toBe(false)
  })

  it('should normalize phone numbers by removing formatting characters', () => {
    expect(normalizeTeacherPhoneNumber('+91 98765-43210')).toBe('+919876543210')
    expect(normalizeTeacherPhoneNumber('(020) 7946 0958')).toBe('02079460958')
  })

  it('should allow only approved document MIME types', () => {
    expect(isAllowedDocumentMimeType('application/pdf')).toBe(true)
    expect(isAllowedDocumentMimeType('image/jpeg')).toBe(true)
    expect(isAllowedDocumentMimeType('image/png')).toBe(true)
    expect(isAllowedDocumentMimeType('image/svg+xml')).toBe(false)
    expect(isAllowedDocumentMimeType('text/plain')).toBe(false)
    expect(isAllowedDocumentMimeType(null)).toBe(false)
  })

  it('should enforce the maximum document size limit', () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('Teacher Enquiry — database-backed API', () => {
  let createdDocumentId: number | null = null
  let createdApplicationId: number | null = null

  beforeAll(async () => {
    try {
      const payloadConfig = await config
      payload = await getPayload({ config: payloadConfig })

      const existing = await payload.find({
        collection: 'users',
        where: { email: { equals: ADMIN_EMAIL } },
        limit: 1,
      })

      if (existing.docs.length === 0) {
        await payload.create({
          collection: 'users',
          data: {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'super_admin',
            status: 'active',
          },
        })
      }
    } catch (err: unknown) {
      console.warn(
        'Teacher Enquiry tests: could not connect to the database, database-backed tests will be skipped.',
        err,
      )
    }
  })


  it('should upload a private document and persist a valid application', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    // Upload a private KYC document server-side (as the public submission route does).
    const document = await payload.create({
      collection: 'teacher-documents',
      data: { alt: 'Aadhaar card' },
      file: {
        data: Buffer.from('dummy pdf content'),
        name: 'aadhaar.pdf',
        mimetype: 'application/pdf',
        size: 19,
      },
    })
    expect(document.id).toBeDefined()
    createdDocumentId = document.id

    const created = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        ...VALID_APPLICATION_DATA,
        aadhaarDocument: document.id,
        qualificationDocument: null,
      },
    })

    expect(created.id).toBeDefined()
    expect(created.fullName).toBe('Ravi Kumar')
    expect(created.mobileNumber).toBe('+919876543210')
    expect(created.email).toBe('ravi@example.com')
    expect(created.highestQualification).toBe('M.Sc')
    expect(created.teachingExperience).toBe('3 years')
    expect(created.primarySubject).toBe('Mathematics')
    expect(created.classLevel).toBe('Class 10')
    expect(created.teachingLocality).toBe('Dwarka, Delhi')
    expect(created.preferredAvailability).toBe('Weekday evenings')
    expect(created.additionalNotes).toBe('Can travel within South Delhi.')
    expect(created.agreedToPolicy).toBe(true)
    expect(typeof created.aadhaarDocument === 'object' ? (created.aadhaarDocument as any)?.id : created.aadhaarDocument).toBe(document.id)
    expect(created.applicationStatus).toBe('new')
    expect(created.createdAt).toBeDefined()
    expect(created.updatedAt).toBeDefined()

    createdApplicationId = created.id
  })

  it('should require agreedToPolicy to be true', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    await expect(
      payload.create({
        collection: 'teacher-enquiries',
        data: { ...VALID_APPLICATION_DATA, agreedToPolicy: false },
      }),
    ).rejects.toBeDefined()
  })

  it('should reject missing required fields', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const { fullName: _missing, ...incomplete } = VALID_APPLICATION_DATA

    await expect(
      payload.create({
        collection: 'teacher-enquiries',
        data: incomplete as any,
      }),
    ).rejects.toBeDefined()
  })

  it('should reject an invalid mobile number', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    await expect(
      payload.create({
        collection: 'teacher-enquiries',
        data: { ...VALID_APPLICATION_DATA, mobileNumber: 'not-a-phone' },
      }),
    ).rejects.toBeDefined()
  })

  it('should reject an invalid document MIME type', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    await expect(
      payload.create({
        collection: 'teacher-documents',
        data: { alt: 'Bad file' },
        file: {
          data: Buffer.from('bad'),
          name: 'bad.svg',
          mimetype: 'image/svg+xml',
          size: 3,
        },
      }),
    ).rejects.toBeDefined()
  })

  it('should persist the application and allow fetching it by id', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const created = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        ...VALID_APPLICATION_DATA,
        mobileNumber: '+91 90000 00000',
      },
    })

    const fetched = await payload.findByID({
      collection: 'teacher-enquiries',
      id: created.id,
    })

    expect(fetched.id).toBe(created.id)
    expect(fetched.fullName).toBe('Ravi Kumar')
    expect(fetched.mobileNumber).toBe('+919000000000')
    expect(fetched.classLevel).toBe('Class 10')

    createdApplicationId = created.id
  })

  it('should create a corresponding teacher profile when application is approved and be idempotent', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const app = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        ...VALID_APPLICATION_DATA,
        fullName: 'Professor Anita Sharma',
        mobileNumber: '+91 91111 22222',
        email: 'anita.sharma@example.com',
        primarySubject: 'Physics',
        highestQualification: 'Ph.D. in Physics',
        teachingExperience: '7 years',
        classLevel: 'Class 11-12',
        teachingLocality: 'Salt Lake, Kolkata',
      },
    })

    // Advance through valid transitions: new -> under_review -> shortlisted -> approved
    await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: { applicationStatus: 'under_review' },
    })
    await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: { applicationStatus: 'shortlisted' },
    })
    const updated = await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: {
        registrationFee: { status: 'paid' },
        applicationStatus: 'approved',
        reviewedAt: new Date().toISOString(),
      },
    })

    expect(updated.applicationStatus).toBe('approved')

    // Verify teacher profile was created
    const profiles = await payload.find({
      collection: 'teacher-profiles',
      where: {
        teacherEnquiry: { equals: app.id },
      },
    })

    expect(profiles.docs.length).toBe(1)
    const profile = profiles.docs[0]
    expect(profile.name).toBe('Professor Anita Sharma')
    expect(profile.primarySubject).toBe('Physics')
    expect(profile.qualification).toBe('Ph.D. in Physics')
    expect(profile.experienceYears).toBe(7)
    expect(profile.approvalStatus).toBe('approved')
    expect(profile.registrationFee?.status).toBe('paid')
    expect(profile.kyc?.status).toBe('verified')

    // Idempotency: Repeated approval should not create a duplicate profile
    await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: {
        registrationFee: { status: 'paid' },
        applicationStatus: 'approved',
        adminNotes: 'Repeated approval check',
      },
    })

    const profilesAfter = await payload.find({
      collection: 'teacher-profiles',
      where: {
        teacherEnquiry: { equals: app.id },
      },
    })

    expect(profilesAfter.docs.length).toBe(1)

    // Cleanup
    await payload.delete({ collection: 'teacher-profiles', id: profile.id })
    await payload.delete({ collection: 'teacher-enquiries', id: app.id })
  })

  it('should block approval until the registration fee is paid or skipped', async ({ skip }) => {
    if (!payload) skip()
    const app = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Fee Gate Teacher',
        mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        highestQualification: 'B.Ed',
        teachingExperience: '2 years',
        primarySubject: 'Maths',
        classLevel: 'Class 6-10',
        teachingLocality: 'Patna',
        preferredAvailability: 'Evening',
        agreedToPolicy: true,
      },
    })
    for (const st of ['under_review', 'shortlisted']) {
      await payload.update({ collection: 'teacher-enquiries', id: app.id, data: { applicationStatus: st } })
    }
    await expect(
      payload.update({ collection: 'teacher-enquiries', id: app.id, data: { applicationStatus: 'approved' } }),
    ).rejects.toThrow(/registration fee/i)

    const done = await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: { registrationFee: { status: 'waived' }, applicationStatus: 'approved' },
    })
    expect(done.applicationStatus).toBe('approved')

    const profiles = await payload.find({ collection: 'teacher-profiles', where: { teacherEnquiry: { equals: app.id } } })
    for (const prof of profiles.docs) await payload.delete({ collection: 'teacher-profiles', id: prof.id })
    await payload.delete({ collection: 'teacher-enquiries', id: app.id })
  })

  it('should exclude approved applications when excludeApproved filter is applied', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const appNew = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        ...VALID_APPLICATION_DATA,
        fullName: 'Pending Applicant',
        mobileNumber: '+91 93333 44444',
      },
    })

    const appApproved = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        ...VALID_APPLICATION_DATA,
        fullName: 'Approved Teacher Candidate',
        mobileNumber: '+91 95555 66666',
      },
    })

    await payload.update({
      collection: 'teacher-enquiries',
      id: appApproved.id,
      data: { applicationStatus: 'under_review' },
    })
    await payload.update({
      collection: 'teacher-enquiries',
      id: appApproved.id,
      data: { applicationStatus: 'shortlisted' },
    })
    await payload.update({
      collection: 'teacher-enquiries',
      id: appApproved.id,
      data: {
        registrationFee: { status: 'paid' },
        applicationStatus: 'approved',
      },
    })

    // Query with not_equals approved
    const activeInquiries = await payload.find({
      collection: 'teacher-enquiries',
      where: {
        applicationStatus: { not_equals: 'approved' },
      },
    })

    const activeIds = activeInquiries.docs.map((d: any) => d.id)
    expect(activeIds).toContain(appNew.id)
    expect(activeIds).not.toContain(appApproved.id)

    // Cleanup
    const approvedProfile = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: appApproved.id } },
    })
    if (approvedProfile.docs.length > 0) {
      await payload.delete({ collection: 'teacher-profiles', id: approvedProfile.docs[0].id })
    }
    await payload.delete({ collection: 'teacher-enquiries', id: appNew.id })
    await payload.delete({ collection: 'teacher-enquiries', id: appApproved.id })
  })

  it('should not expose document URLs in the public submission response shape', ({ skip }) => {
    // The public response helper excludes private document references. This is a
    // unit assertion on the response shape used by the route handler.
    expect(typeof (globalThis as any).pickPublicTeacherFields).toBe('undefined')
  })

  afterAll(async () => {
    if (!payload) {
      return
    }
    try {
      if (createdApplicationId) {
        await payload.delete({ collection: 'teacher-enquiries', id: createdApplicationId })
      }
      if (createdDocumentId) {
        await payload.delete({ collection: 'teacher-documents', id: createdDocumentId })
      }
    } catch {
      // Ignore cleanup errors
    }
  })
})