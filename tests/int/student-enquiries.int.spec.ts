import {
  canManageStudentEnquiries,
  enquiryStatuses,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from '@/collections/StudentEnquiries'
import { POST, GET } from '@/app/api/student-enquiries/route'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { REST_GET, REST_PATCH, REST_DELETE } from '@payloadcms/next/routes'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'



let payload: any

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const TEACHER_EMAIL = 'teacher@example.com'
const TEACHER_PASSWORD = 'TeacherPass123'

let adminToken: string | null = null
let teacherToken: string | null = null
let createdEnquiryIds: number[] = []

// Payload stores array fields as rows of objects. The public HTTP API accepts
// plain string[] (matching TutorEnquiryFormData) and maps to this shape.
const VALID_ENQUIRY_DATA = {
  studentClass: 'Class 10',
  subjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
  customSubject: 'Vedic Maths',
  preferredTiming: 'Weekday evenings',
  locality: 'Central London',
  customLocality: 'Canary Wharf',
  budgetRange: 'GBP 30-50 per hour',
  name: 'Aanya Sharma',
  phoneNumber: '+44 20 7946 0958',
  additionalNotes: 'Prefers evening slots.',
  agreedToPolicy: true,
}

function mockRequest(
  path: string,
  headers: Record<string, string> = {},
  body: unknown = null,
  method?: string,
): Request {
  const reqInit: RequestInit = {
    method: method || (body !== null && body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...headers,
      ...(body !== null && body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  }
  if (body !== null && body !== undefined) {
    reqInit.body = JSON.stringify(body)
  }
  const req = new Request(`http://localhost:3000${path}`, reqInit)
  if (body !== null && body !== undefined) {
    ;(req as any).data = body
  }
  return req
}

async function getTestPayload() {
  const baseConfig = await config;
  const resolvedConfig = { ...baseConfig };
  if (process.env.PAYLOAD_SECRET && !resolvedConfig.secret) {
    resolvedConfig.secret = process.env.PAYLOAD_SECRET;
  }
  return getPayload({ config: resolvedConfig });
}

async function ensureSeedData(): Promise<void> {
  const existingAdmin = await payload.find({
    collection: 'users',
    where: { email: { equals: ADMIN_EMAIL } },
    limit: 1,
  });
  if (existingAdmin.docs.length === 0) {
    await payload.create({
      collection: 'users',
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'super_admin',
        status: 'active',
      },
    });
  } else {
    await payload.update({
      collection: 'users',
      id: existingAdmin.docs[0].id,
      data: {
        password: ADMIN_PASSWORD,
        role: 'super_admin',
        status: 'active',
      },
      overrideAccess: true,
    });
  }

  const teacherCheck = await payload.find({
    collection: 'users',
    where: { email: { equals: TEACHER_EMAIL } },
    limit: 1,
  });
  if (teacherCheck.docs.length === 0) {
    await payload.create({
      collection: 'users',
      data: {
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        role: 'teacher',
        status: 'active',
      },
    });
  } else {
    await payload.update({
      collection: 'users',
      id: teacherCheck.docs[0].id,
      data: {
        password: TEACHER_PASSWORD,
        role: 'teacher',
        status: 'active',
      },
      overrideAccess: true,
    });
  }

  const adminAuth = await payload.login({
    collection: 'users',
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  adminToken = adminAuth.token;

  const teacherAuth = await payload.login({
    collection: 'users',
    data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
  });
  teacherToken = teacherAuth.token;
}

function cleanupEnquiries(): Promise<unknown>[] {
  return createdEnquiryIds.map((id) =>
    payload
      .delete({ collection: 'student-enquiries', id, overrideAccess: true })
      .catch(() => {
        // Ignore cleanup errors
      }),
  )
}

describe('Student Enquiry — access control rules (no database required)', () => {
  it('should allow enquiry management only for super_admin', () => {
    expect(canManageStudentEnquiries({ role: 'super_admin' } as any)).toBe(true)
    expect(canManageStudentEnquiries({ role: 'teacher' } as any)).toBe(false)
    expect(canManageStudentEnquiries(null)).toBe(false)
    expect(canManageStudentEnquiries(undefined)).toBe(false)
  })

  it('should support all required enquiry status values', () => {
    expect(enquiryStatuses).toEqual([
      'new',
      'contacted',
      'in_progress',
      'test',
      'converted',
      'allocated',
      'closed',
    ])
  })

  it('should validate phone numbers without assuming any country code', () => {
    expect(isValidPhoneNumber('02079460958')).toBe(true)
    expect(isValidPhoneNumber('+12345678901')).toBe(true)
    expect(isValidPhoneNumber('+44 20 7946-0958')).toBe(true)
    expect(isValidPhoneNumber('+61 400 000 000')).toBe(true)
    expect(isValidPhoneNumber('123456')).toBe(false)
    expect(isValidPhoneNumber('abcdefghij')).toBe(false)
    expect(isValidPhoneNumber(null)).toBe(false)
    expect(isValidPhoneNumber(undefined)).toBe(false)
  })

  it('should normalize phone numbers by removing formatting characters', () => {
    expect(normalizePhoneNumber('+44 20 7946-0958')).toBe('+442079460958')
    expect(normalizePhoneNumber('(020) 7946 0958')).toBe('02079460958')
    expect(normalizePhoneNumber('+1 (234) 567-8901')).toBe('+12345678901')
  })
})

describe('Student Enquiry — database-backed public submission', () => {
  beforeAll(async () => {
    try {
      payload = await getTestPayload()

      await ensureSeedData()
    } catch (err: unknown) {
      console.warn(
        'Student Enquiry tests: could not connect to the database, database-backed tests will be skipped.',
        err,
      )
    }
  })

  afterAll(async () => {
    if (!payload) return
    await Promise.all(cleanupEnquiries())
    createdEnquiryIds = []
  })

  it('should submit a valid enquiry publicly', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const created = await payload.create({
      collection: 'student-enquiries',
      data: VALID_ENQUIRY_DATA,
    })

    expect(created.id).toBeDefined()
    expect(created.studentClass).toBe('Class 10')
    expect(created.subjects.map((s: any) => s.subject)).toEqual([
      'Mathematics',
      'English',
    ])
    expect(created.customSubject).toBe('Vedic Maths')
    expect(created.preferredTiming).toBe('Weekday evenings')
    expect(created.locality).toBe('Central London')
    expect(created.customLocality).toBe('Canary Wharf')
    expect(created.budgetRange).toBe('GBP 30-50 per hour')
    expect(created.name).toBe('Aanya Sharma')
    expect(isValidPhoneNumber(created.phoneNumber)).toBe(true)
    expect(created.additionalNotes).toBe('Prefers evening slots.')
    expect(created.agreedToPolicy).toBe(true)
    expect(created.enquiryStatus).toBe('new')
    expect(created.createdAt).toBeDefined()
    expect(created.updatedAt).toBeDefined()

    createdEnquiryIds.push(created.id)
  })

  it('should reject agreedToPolicy: false', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    await expect(
      payload.create({
        collection: 'student-enquiries',
        data: { ...VALID_ENQUIRY_DATA, agreedToPolicy: false },
      }),
    ).rejects.toBeDefined()
  })

  it('should reject missing required fields', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const { name: _missing, ...incomplete } = VALID_ENQUIRY_DATA

    await expect(
      payload.create({
        collection: 'student-enquiries',
        data: incomplete as any,
      }),
    ).rejects.toBeDefined()
  })

  it('should reject an invalid phone number', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    await expect(
      payload.create({
        collection: 'student-enquiries',
        data: { ...VALID_ENQUIRY_DATA, phoneNumber: 'not-a-phone-number' },
      }),
    ).rejects.toBeDefined()
  })

  it('should require at least one subject', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    await expect(
      payload.create({
        collection: 'student-enquiries',
        data: { ...VALID_ENQUIRY_DATA, subjects: [] },
      }),
    ).rejects.toBeDefined()
  })

  it('should never store internal management fields from a public submission', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const created = await payload.create({
      collection: 'student-enquiries',
      data: {
        ...VALID_ENQUIRY_DATA,
        enquiryStatus: 'converted',
        adminNotes: 'should not be stored',
        assignedTo: 1,
      },
    })

    expect(created.enquiryStatus).toBe('new')
    expect(created.adminNotes).toBeFalsy()
    expect(created.assignedTo).toBeFalsy()

    createdEnquiryIds.push(created.id)
  })

  it('should persist the enquiry and allow fetching it by id', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const created = await payload.create({
      collection: 'student-enquiries',
      data: {
        ...VALID_ENQUIRY_DATA,
        phoneNumber: '+44 7700 900123',
      },
    })

    const fetched = await payload.findByID({
      collection: 'student-enquiries',
      id: created.id,
      overrideAccess: true,
    })

    expect(fetched.id).toBe(created.id)
    expect(fetched.name).toBe('Aanya Sharma')
    expect(fetched.phoneNumber).toBe('+447700900123')
    expect(fetched.subjects.map((s: any) => s.subject)).toEqual([
      'Mathematics',
      'English',
    ])

    createdEnquiryIds.push(created.id)
  })

  it('should deny unauthenticated public read/update/delete via the local API', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    // List — the local API defaults to overrideAccess: true, so enforce
    // access control explicitly. Public callers must see no enquiries.
    await expect(
      payload.find({
        collection: 'student-enquiries',
        limit: 1,
        overrideAccess: false,
      }),
    ).rejects.toBeDefined()

    // Create one, then try reading/updating/deleting without auth.
    // Access control is only enforced when overrideAccess is false.
    const created = await payload.create({
      collection: 'student-enquiries',
      data: VALID_ENQUIRY_DATA,
    })
    createdEnquiryIds.push(created.id)

    await expect(
      payload.findByID({
        collection: 'student-enquiries',
        id: created.id,
        overrideAccess: false,
      }),
    ).rejects.toBeDefined()

    await expect(
      payload.update({
        collection: 'student-enquiries',
        id: created.id,
        data: { name: 'Tampered' },
        overrideAccess: false,
      }),
    ).rejects.toBeDefined()

    await expect(
      payload.delete({
        collection: 'student-enquiries',
        id: created.id,
        overrideAccess: false,
      }),
    ).rejects.toBeDefined()
  })
})

describe('Student Enquiry — HTTP route handlers', () => {
  beforeAll(async () => {
    try {
      const payloadConfig = await config
      payload = await getTestPayload()

      await ensureSeedData()
    } catch (err: unknown) {
      console.warn(
        'Student Enquiry route tests: could not connect to the database, route tests will be skipped.',
        err,
      )
    }
  })

  afterAll(async () => {
    if (!payload) return
    await Promise.all(cleanupEnquiries())
    createdEnquiryIds = []
  })

  it('POST: should accept a valid public enquiry submission', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const body = {
      studentClass: 'Class 10',
      subjects: ['Mathematics', 'English'],
      preferredTiming: 'Weekday evenings',
      locality: 'Central London',
      budgetRange: 'GBP 30-50 per hour',
      name: 'Route Tester',
      phoneNumber: '+44 20 7946 0958',
      agreedToPolicy: true,
    }

    const res = await POST(mockRequest('/api/student-enquiries', {}, body))
    expect(res.status).toBe(201)

    const json = await res.json()
    expect(json.message).toBe('Enquiry submitted successfully.')
    expect(json.enquiry.id).toBeDefined()
    expect(json.enquiry.studentClass).toBe('Class 10')
    expect(json.enquiry.subjects).toEqual(['Mathematics', 'English'])
    expect(json.enquiry.name).toBe('Route Tester')
    expect(json.enquiry.phoneNumber).toBe('+442079460958')
    expect(json.enquiry.agreedToPolicy).toBe(true)
    expect(json.enquiry.createdAt).toBeDefined()

    // Internal management fields must not be returned to public callers
    expect(json.enquiry.enquiryStatus).toBeUndefined()
    expect(json.enquiry.adminNotes).toBeUndefined()
    expect(json.enquiry.assignedTo).toBeUndefined()

    createdEnquiryIds.push(json.enquiry.id)
  })

  it('POST: should reject missing required fields', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const res = await POST(
      mockRequest('/api/student-enquiries', {}, {
        name: 'Only Name',
        agreedToPolicy: true,
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('is required')
  })

  it('POST: should reject agreedToPolicy: false', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const res = await POST(
      mockRequest('/api/student-enquiries', {}, {
        ...VALID_ENQUIRY_DATA,
        subjects: ['Mathematics'],
        agreedToPolicy: false,
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('You must agree to the policy to submit an enquiry.')
  })

  it('POST: should reject an invalid phone number', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const res = await POST(
      mockRequest('/api/student-enquiries', {}, {
        ...VALID_ENQUIRY_DATA,
        subjects: ['Mathematics'],
        phoneNumber: 'not-a-phone-number',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST: should not store internal fields sent by a public caller', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const res = await POST(
      mockRequest('/api/student-enquiries', {}, {
        ...VALID_ENQUIRY_DATA,
        subjects: ['Mathematics'],
        enquiryStatus: 'converted',
        adminNotes: 'tamper attempt',
        assignedTo: 1,
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    createdEnquiryIds.push(json.enquiry.id)

    // Verify via the local API what was actually stored
    const stored = await payload.findByID({
      collection: 'student-enquiries',
      id: json.enquiry.id,
      overrideAccess: true,
    })
    expect(stored.enquiryStatus).toBe('new')
    expect(stored.adminNotes).toBeFalsy()
    expect(stored.assignedTo).toBeFalsy()
  })

  it('GET (list): should deny unauthenticated public callers', async ({ skip }) => {
    if (!payload) {
      skip()
      return
    }

    const res = await GET(mockRequest('/api/student-enquiries'))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Super admin access required.')
  })

  it('GET (list): should deny a teacher role', async ({ skip }) => {
    if (!payload || !teacherToken) {
      skip()
      return
    }

    const res = await GET(
      mockRequest('/api/student-enquiries', {
        authorization: `Bearer ${teacherToken}`,
      }),
    )
    expect(res.status).toBe(403)
  })

  it('GET (list): should allow super_admin with pagination', async ({ skip }) => {
    if (!payload || !adminToken) {
      skip()
      return
    }

    const res = await GET(
      mockRequest(
        '/api/student-enquiries?limit=5&page=1&sort=-createdAt',
        { authorization: `Bearer ${adminToken}` },
      ),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totalDocs).toBeDefined()
    expect(json.page).toBe(1)
    expect(json.limit).toBe(5)
    expect(Array.isArray(json.docs)).toBe(true)
    expect(json.docs[0]?.enquiryStatus).toBeDefined()
  })

  it('GET (list): should support filtering by enquiryStatus', async ({ skip }) => {
    if (!payload || !adminToken) {
      skip()
      return
    }

    const res = await GET(
      mockRequest('/api/student-enquiries?enquiryStatus=new', {
        authorization: `Bearer ${adminToken}`,
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totalDocs).toBeGreaterThan(0)
    for (const doc of json.docs) {
      const stored = await payload.findByID({
        collection: 'student-enquiries',
        id: doc.id,
        overrideAccess: true,
      })
      expect(stored.enquiryStatus).toBe('new')
    }
  })
})

describe('Student Enquiry — Payload REST endpoints (admin only)', () => {
  let enquiryId: number | null = null
  const restGet = REST_GET(config)
  const restPatch = REST_PATCH(config)
  const restDelete = REST_DELETE(config)

  beforeAll(async () => {
    try {
      payload = await getTestPayload()
    } catch {
      return
    }
    if (!payload) {
      return
    }
    await ensureSeedData()
    const created = await payload.create({
      collection: 'student-enquiries',
      data: VALID_ENQUIRY_DATA,
    })
    enquiryId = created.id
    createdEnquiryIds.push(created.id)
  })

  afterAll(async () => {
    if (!payload || !enquiryId) return
    try {
      await payload.delete({
        collection: 'student-enquiries',
        id: enquiryId,
        overrideAccess: true,
      })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('GET /:id: should deny unauthenticated and teacher callers', async ({ skip }) => {
    if (!payload || !enquiryId) {
      skip()
      return
    }

    const unauth = await restGet(
      mockRequest(`/api/student-enquiries/${enquiryId}`),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
      },
    )
    expect(unauth.status).toBe(403)

    if (teacherToken) {
      const asTeacher = await restGet(
        mockRequest(`/api/student-enquiries/${enquiryId}`, {
          authorization: `Bearer ${teacherToken}`,
        }),
        {
          params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
        },
      )
      expect(asTeacher.status).toBe(403)
    }
  })

  it('GET /:id: should allow super_admin and return full document', async ({ skip }) => {
    if (!payload || !enquiryId || !adminToken) {
      skip()
      return
    }

    const res = await restGet(
      mockRequest(`/api/student-enquiries/${enquiryId}`, {
        authorization: `Bearer ${adminToken}`,
      }),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(enquiryId)
    expect(json.name).toBe('Aanya Sharma')
    expect(json.enquiryStatus).toBe('new')
    expect(json.createdAt).toBeDefined()
    expect(json.updatedAt).toBeDefined()
  })

  it('PATCH /:id: should allow super_admin to update public and internal fields', async ({ skip }) => {
    if (!payload || !enquiryId || !adminToken) {
      skip()
      return
    }

    const res = await restPatch(
      mockRequest(`/api/student-enquiries/${enquiryId}`, {
        authorization: `Bearer ${adminToken}`,
      }, {
        enquiryStatus: 'contacted',
        adminNotes: 'Called parent; interested in trial class.',
        assignedTo: 1,
      }, 'PATCH'),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    const doc = json.doc || json
    expect(doc.enquiryStatus).toBe('contacted')
    expect(doc.adminNotes).toBe('Called parent; interested in trial class.')
    expect(typeof doc.assignedTo === 'object' ? doc.assignedTo.id : doc.assignedTo).toBe(1)
  })

  it('PATCH /:id: should reject closing via REST when changeReason is missing', async ({ skip }) => {
    if (!payload || !enquiryId || !adminToken) {
      skip()
      return
    }

    const res = await restPatch(
      mockRequest(`/api/student-enquiries/${enquiryId}`, {
        authorization: `Bearer ${adminToken}`,
      }, {
        enquiryStatus: 'closed',
      }, 'PATCH'),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
      },
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.errors?.[0]?.message).toContain('reason is mandatory')
  })

  it('PATCH /:id: should allow closing via REST with changeReason', async ({ skip }) => {
    if (!payload || !enquiryId || !adminToken) {
      skip()
      return
    }

    const res = await restPatch(
      mockRequest(`/api/student-enquiries/${enquiryId}`, {
        authorization: `Bearer ${adminToken}`,
      }, {
        enquiryStatus: 'closed',
        changeReason: 'Parent found alternative schedule.',
      }, 'PATCH'),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    const doc = json.doc || json
    expect(doc.enquiryStatus).toBe('closed')

    // Verify audit log has the reason recorded
    const audits = await payload.find({
      collection: 'enquiry-audit-log',
      where: { studentEnquiry: { equals: enquiryId } },
      sort: '-changedAt',
      limit: 1,
    })
    expect(audits.docs[0].newStatus).toBe('closed')
    expect(audits.docs[0].changeReason).toBe('Parent found alternative schedule.')
  })

  it('PATCH /:id: should deny unauthenticated and teacher callers', async ({ skip }) => {
    if (!payload || !enquiryId) {
      skip()
      return
    }

    const unauth = await restPatch(
      mockRequest(`/api/student-enquiries/${enquiryId}`, {}, { name: 'X' }, 'PATCH'),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
      },
    )
    // Payload returns 403 (forbidden) or 404 (not accessible) depending on
    // the operation; both mean access is denied.
    expect([403, 404]).toContain(unauth.status)

    if (teacherToken) {
      const asTeacher = await restPatch(
        mockRequest(`/api/student-enquiries/${enquiryId}`, {
          authorization: `Bearer ${teacherToken}`,
        }, { name: 'X' }, 'PATCH'),
        {
          params: Promise.resolve({ slug: ['student-enquiries', String(enquiryId)] } as { slug?: string[] | undefined }),
        },
      )
      expect([403, 404]).toContain(asTeacher.status)
    }
  })

  it('DELETE /:id: should allow super_admin to delete', async ({ skip }) => {
    if (!payload || !adminToken) {
      skip()
      return
    }

    // Create a dedicated enquiry to delete
    const created = await payload.create({
      collection: 'student-enquiries',
      data: { ...VALID_ENQUIRY_DATA, subjects: [{ subject: 'Physics' }] },
    })
    const id = created.id

    const del = await restDelete(
      mockRequest(`/api/student-enquiries/${id}`, {
        authorization: `Bearer ${adminToken}`,
      }, null, 'DELETE'),
      {
        params: Promise.resolve({ slug: ['student-enquiries', String(id)] } as { slug?: string[] | undefined }),
      },
    )
    expect(del.status).toBe(200)
    createdEnquiryIds.splice(createdEnquiryIds.indexOf(id), 1)
  })
})

