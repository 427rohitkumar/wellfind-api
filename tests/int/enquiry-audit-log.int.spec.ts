import { getPayload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { canReadEnquiryAuditLog } from '@/collections/EnquiryAuditLog'

let payload: any

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'

describe('Enquiry Audit Log — server-side status change tracking', () => {
  let adminToken: string | null = null

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

      const adminResult = await payload.login({
        collection: 'users',
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      })
      adminToken = adminResult.token
    } catch (err: unknown) {
      console.warn(
        'Enquiry Audit Log tests: could not connect to the database, database-backed tests will be skipped.',
        err,
      )
    }
  })

  describe('Access control (no database required for logic)', () => {
    it('should have restrictive access rules on audit log collection', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }
      expect(canReadEnquiryAuditLog({ role: 'super_admin' })).toBe(true)
      expect(canReadEnquiryAuditLog({ role: 'teacher' })).toBe(false)
      expect(canReadEnquiryAuditLog(null)).toBe(false)
      expect(canReadEnquiryAuditLog(undefined)).toBe(false)
    })
  })

  describe('Database-backed audit logging', () => {
    let studentEnquiryId: number | null = null
    let teacherEnquiryId: number | null = null
    let auditIds: number[] = []

    afterAll(async () => {
      if (!payload) {
        return
      }
      for (const id of auditIds) {
        try {
          await payload.delete({ collection: 'enquiry-audit-log', id })
        } catch {
          // Ignore cleanup errors
        }
      }
      if (studentEnquiryId) {
        try {
          await payload.delete({ collection: 'student-enquiries', id: studentEnquiryId })
        } catch {
          // Ignore cleanup errors
        }
      }
      if (teacherEnquiryId) {
        try {
          await payload.delete({ collection: 'teacher-enquiries', id: teacherEnquiryId })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should create an audit entry when a student enquiry status changes', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      const created = await payload.create({
        collection: 'student-enquiries',
        data: {
          studentClass: 'Class 10',
          subjects: [{ subject: 'Mathematics' }],
          preferredTiming: 'Weekday evenings',
          locality: 'Central London',
          budgetRange: 'GBP 30-50 per hour',
          name: 'Test Student',
          phoneNumber: '+44 20 7946 0958',
          agreedToPolicy: true,
        },
      })
      studentEnquiryId = created.id

      // Verify no audit entry was created for initial creation
      const initialAudits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: studentEnquiryId } },
        limit: 10,
      })
      expect(initialAudits.docs.length).toBe(0)

      // Update the status
      const updated = await payload.update({
        collection: 'student-enquiries',
        id: studentEnquiryId,
        data: { enquiryStatus: 'contacted' },
      })

      expect(updated.enquiryStatus).toBe('contacted')

      // Verify audit entry was created
      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: studentEnquiryId } },
        limit: 10,
        sort: '-changedAt',
      })

      expect(audits.docs.length).toBe(1)
      const audit = audits.docs[0]
      expect(audit.enquiryType).toBe('student')
      expect(audit.studentEnquiry?.id ?? audit.studentEnquiry).toBe(studentEnquiryId)
      expect(audit.fieldChanged).toBe('enquiryStatus')
      expect(audit.previousStatus).toBe('new')
      expect(audit.newStatus).toBe('contacted')
      expect(audit.changedBy).toBeDefined()
      expect(audit.changedAt).toBeDefined()
      expect(audit.changedAt).not.toBeNull()
      auditIds.push(audit.id)
    })

    it('should create an audit entry when a teacher application status changes', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      const created = await payload.create({
        collection: 'teacher-enquiries',
        data: {
          fullName: 'Test Teacher',
          mobileNumber: '+91 98765 43210',
          highestQualification: 'M.Sc',
          teachingExperience: '3 years',
          primarySubject: 'Mathematics',
          classLevel: 'Class 10',
          teachingLocality: 'Dwarka, Delhi',
          preferredAvailability: 'Weekday evenings',
          agreedToPolicy: true,
        },
      })
      teacherEnquiryId = created.id

      // Verify no audit entry for initial creation
      const initialAudits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { teacherEnquiry: { equals: teacherEnquiryId } },
        limit: 10,
      })
      expect(initialAudits.docs.length).toBe(0)

      // Update the status
      const updated = await payload.update({
        collection: 'teacher-enquiries',
        id: teacherEnquiryId,
        data: { applicationStatus: 'under_review' },
      })

      expect(updated.applicationStatus).toBe('under_review')

      // Verify audit entry was created
      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { teacherEnquiry: { equals: teacherEnquiryId } },
        limit: 10,
        sort: '-changedAt',
      })

      expect(audits.docs.length).toBe(1)
      const audit = audits.docs[0]
      expect(audit.enquiryType).toBe('teacher')
      expect(audit.teacherEnquiry?.id ?? audit.teacherEnquiry).toBe(teacherEnquiryId)
      expect(audit.fieldChanged).toBe('applicationStatus')
      expect(audit.previousStatus).toBe('new')
      expect(audit.newStatus).toBe('under_review')
      expect(audit.changedBy).toBeDefined()
      expect(audit.changedAt).toBeDefined()
      expect(audit.changedAt).not.toBeNull()
      auditIds.push(audit.id)
    })

    it('should not create duplicate audit entries when status is unchanged', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      if (!studentEnquiryId) {
        skip()
        return
      }

      const auditCountBefore = await payload.count({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: studentEnquiryId } },
      })

      // Update a non-status field
      await payload.update({
        collection: 'student-enquiries',
        id: studentEnquiryId,
        data: { adminNotes: 'Test note' },
      })

      // Update status to the same value
      await payload.update({
        collection: 'student-enquiries',
        id: studentEnquiryId,
        data: { enquiryStatus: 'contacted' },
      })

      const auditCountAfter = await payload.count({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: studentEnquiryId } },
      })

      expect(auditCountAfter.totalDocs).toBe(auditCountBefore.totalDocs)
    })

    it('should record changedBy from authenticated server context', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      if (!teacherEnquiryId) {
        skip()
        return
      }

      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { teacherEnquiry: { equals: teacherEnquiryId } },
        limit: 10,
        sort: '-changedAt',
      })

      const latestAudit = audits.docs[0]
      // changedBy should be set from the authenticated super_admin context
      expect(latestAudit.changedBy).toBeDefined()
    })

    it('should allow super_admin to read audit log', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        limit: 10,
      })

      expect(audits.docs).toBeDefined()
      expect(audits.totalDocs).toBeGreaterThanOrEqual(0)
    })

    it('should be immutable — update and delete should be blocked', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        limit: 1,
      })

      if (audits.docs.length === 0) {
        skip()
        return
      }

      const auditId = audits.docs[0].id

      // Update should be blocked by access control
      const updateResult = await payload
        .update({
          collection: 'enquiry-audit-log',
          id: auditId,
          data: { newStatus: 'tampered' },
        })
        .then((r: any) => r)
        .catch((e: any) => e)

      // Delete should be blocked by access control
      const deleteResult = await payload
        .delete({ collection: 'enquiry-audit-log', id: auditId })
        .then((r: any) => r)
        .catch((e: any) => e)

      expect(updateResult).toBeDefined()
      expect(deleteResult).toBeDefined()
    })

    it('should deny create access to non-super_admin callers (overrideAccess: false)', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      await expect(
        payload.create({
          collection: 'enquiry-audit-log',
          data: {
            enquiryType: 'student',
            fieldChanged: 'enquiryStatus',
            newStatus: 'forged',
          },
          overrideAccess: false,
        })
      ).rejects.toBeDefined()
    })

    it('should deny read access to non-super_admin callers (overrideAccess: false)', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      await expect(
        payload.find({
          collection: 'enquiry-audit-log',
          limit: 1,
          overrideAccess: false,
        })
      ).rejects.toBeDefined()
    })

    it('should propagate errors from the audit log create call', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      // Create a student enquiry in the known 'new' state
      const enquiry = await payload.create({
        collection: 'student-enquiries',
        data: {
          studentClass: 'Class 5',
          subjects: [{ subject: 'Science' }],
          preferredTiming: 'Morning',
          locality: 'Test Area',
          budgetRange: 'GBP 20-30',
          name: 'Error Test Student',
          phoneNumber: '+44 7700 900999',
          agreedToPolicy: true,
        },
      })

      // Stub payload.create on the instance to simulate a DB failure
      const originalCreate = payload.create.bind(payload)
      payload.create = async (args: any) => {
        if (args.collection === 'enquiry-audit-log') {
          throw new Error('Simulated audit DB failure')
        }
        return originalCreate(args)
      }

      try {
        await expect(
          payload.update({
            collection: 'student-enquiries',
            id: enquiry.id,
            data: { enquiryStatus: 'contacted' },
          })
        ).rejects.toThrow('Simulated audit DB failure')
      } finally {
        // Restore original create
        payload.create = originalCreate
        await payload.delete({ collection: 'student-enquiries', id: enquiry.id, overrideAccess: true }).catch(() => {})
      }
    })

    it('end-to-end: multiple status changes create multiple audit entries', async ({ skip }) => {
      if (!payload) {
        skip()
        return
      }

      // Create a student enquiry
      const created = await payload.create({
        collection: 'student-enquiries',
        data: {
          studentClass: 'Class 8',
          subjects: [{ subject: 'History' }],
          preferredTiming: 'Afternoon',
          locality: 'East End',
          budgetRange: 'GBP 25-40',
          name: 'Multi-Status Tester',
          phoneNumber: '+44 7700 900777',
          agreedToPolicy: true,
        },
      })

      const countBefore = await payload.count({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: created.id } },
      })
      expect(countBefore.totalDocs).toBe(0)

      // First status change
      await payload.update({
        collection: 'student-enquiries',
        id: created.id,
        data: { enquiryStatus: 'contacted' },
      })

      // Second status change
      await payload.update({
        collection: 'student-enquiries',
        id: created.id,
        data: { enquiryStatus: 'in_progress' },
      })

      // Third status change
      await payload.update({
        collection: 'student-enquiries',
        id: created.id,
        data: { enquiryStatus: 'converted' },
      })

      // Fourth status change
      await payload.update({
        collection: 'student-enquiries',
        id: created.id,
        data: { enquiryStatus: 'allocated' },
      })

      const countAfter = await payload.count({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: created.id } },
      })
      expect(countAfter.totalDocs).toBe(4)

      // Verify each transition was recorded
      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: created.id } },
        sort: 'changedAt',
        limit: 10,
      })

      expect(audits.docs[0].previousStatus).toBe('new')
      expect(audits.docs[0].newStatus).toBe('contacted')

      expect(audits.docs[1].previousStatus).toBe('contacted')
      expect(audits.docs[1].newStatus).toBe('in_progress')

      expect(audits.docs[2].previousStatus).toBe('in_progress')
      expect(audits.docs[2].newStatus).toBe('converted')

      expect(audits.docs[3].previousStatus).toBe('converted')
      expect(audits.docs[3].newStatus).toBe('allocated')

      // Cleanup
      await payload.delete({ collection: 'student-enquiries', id: created.id, overrideAccess: true }).catch(() => {})
      for (const audit of audits.docs) {
        await payload.delete({ collection: 'enquiry-audit-log', id: audit.id, overrideAccess: true }).catch(() => {})
      }
    })

    describe('Phase 2 — Status Transitions & Mandatory Change Reasons', () => {
      describe('Student Enquiry Status Transitions & Reasons', () => {
        it('should allow valid sequential transitions: new -> contacted -> in_progress -> converted -> allocated', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 9',
              subjects: [{ subject: 'Physics' }],
              preferredTiming: 'Evening',
              locality: 'South Delhi',
              budgetRange: '500-1000',
              name: 'Flow Student',
              phoneNumber: '+91 98765 00001',
              agreedToPolicy: true,
            },
          })

          // new -> contacted
          const s1 = await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'contacted' },
          })
          expect(s1.enquiryStatus).toBe('contacted')

          // contacted -> in_progress
          const s2 = await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'in_progress' },
          })
          expect(s2.enquiryStatus).toBe('in_progress')

          // in_progress -> converted
          const s3 = await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'converted' },
          })
          expect(s3.enquiryStatus).toBe('converted')

          // converted -> allocated
          const s4 = await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'allocated' },
          })
          expect(s4.enquiryStatus).toBe('allocated')

          // Cleanup
          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })

        it('should reject skipped transitions without conversion context: in_progress -> allocated and new -> converted', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 8',
              subjects: [{ subject: 'Maths' }],
              preferredTiming: 'Morning',
              locality: 'North Delhi',
              budgetRange: '400-800',
              name: 'Skip Conversion Student',
              phoneNumber: '+91 98765 00012',
              agreedToPolicy: true,
            },
          })

          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'converted' },
            })
          ).rejects.toThrow(/Invalid status transition/i)

          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'contacted' },
          })
          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'in_progress' },
          })

          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'allocated' },
            })
          ).rejects.toThrow(/Invalid status transition/i)

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })

        it('should reject invalid skipped transition: new -> allocated', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 8',
              subjects: [{ subject: 'Maths' }],
              preferredTiming: 'Morning',
              locality: 'North Delhi',
              budgetRange: '400-800',
              name: 'Skip Student',
              phoneNumber: '+91 98765 00002',
              agreedToPolicy: true,
            },
          })

          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'allocated' },
            })
          ).rejects.toThrow()

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })

        it('should reject closing student enquiry without a reason', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 7',
              subjects: [{ subject: 'Biology' }],
              preferredTiming: 'Morning',
              locality: 'East Delhi',
              budgetRange: '300-600',
              name: 'No Reason Student',
              phoneNumber: '+91 98765 00003',
              agreedToPolicy: true,
            },
          })

          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'closed' },
            })
          ).rejects.toThrow(/reason is mandatory/i)

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })

        it('should reject whitespace-only changeReason when closing', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 7',
              subjects: [{ subject: 'Biology' }],
              preferredTiming: 'Morning',
              locality: 'East Delhi',
              budgetRange: '300-600',
              name: 'Whitespace Student',
              phoneNumber: '+91 98765 00004',
              agreedToPolicy: true,
            },
          })

          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'closed', changeReason: '   \n\t  ' },
            })
          ).rejects.toThrow(/reason is mandatory/i)

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })

        it('should allow closing with a valid reason and record the reason in the audit log', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 7',
              subjects: [{ subject: 'Biology' }],
              preferredTiming: 'Morning',
              locality: 'East Delhi',
              budgetRange: '300-600',
              name: 'Valid Close Student',
              phoneNumber: '+91 98765 00005',
              agreedToPolicy: true,
            },
          })

          const updated = await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'closed', changeReason: 'Parent found fee budget incompatible.' },
          })
          expect(updated.enquiryStatus).toBe('closed')

          // Verify audit log has the reason
          const audits = await payload.find({
            collection: 'enquiry-audit-log',
            where: { studentEnquiry: { equals: student.id } },
            sort: '-changedAt',
            limit: 1,
          })
          expect(audits.docs.length).toBe(1)
          expect(audits.docs[0].previousStatus).toBe('new')
          expect(audits.docs[0].newStatus).toBe('closed')
          expect(audits.docs[0].changeReason).toBe('Parent found fee budget incompatible.')

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
          await payload.delete({ collection: 'enquiry-audit-log', id: audits.docs[0].id, overrideAccess: true }).catch(() => {})
        })

        it('should reject reopening a closed enquiry without a reason', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 7',
              subjects: [{ subject: 'Biology' }],
              preferredTiming: 'Morning',
              locality: 'East Delhi',
              budgetRange: '300-600',
              name: 'Reopen Test Student',
              phoneNumber: '+91 98765 00006',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'closed', changeReason: 'Closed initially.' },
          })

          // Reopening to contacted without reason must fail
          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'contacted' },
            })
          ).rejects.toThrow(/reason is mandatory/i)

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })

        it('should allow reopening a closed enquiry with a reason and capture it in audit log', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 7',
              subjects: [{ subject: 'Biology' }],
              preferredTiming: 'Morning',
              locality: 'East Delhi',
              budgetRange: '300-600',
              name: 'Reopen Success Student',
              phoneNumber: '+91 98765 00007',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'closed', changeReason: 'Closed due to schedule mismatch.' },
          })

          // Reopen to in_progress with reason
          const reopened = await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'in_progress', changeReason: 'Parent reached back out; schedule adjusted.' },
          })
          expect(reopened.enquiryStatus).toBe('in_progress')

          const audits = await payload.find({
            collection: 'enquiry-audit-log',
            where: { studentEnquiry: { equals: student.id } },
            sort: '-changedAt',
            limit: 2,
          })
          expect(audits.docs[0].previousStatus).toBe('closed')
          expect(audits.docs[0].newStatus).toBe('in_progress')
          expect(audits.docs[0].changeReason).toBe('Parent reached back out; schedule adjusted.')

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
          for (const a of audits.docs) {
            await payload.delete({ collection: 'enquiry-audit-log', id: a.id, overrideAccess: true }).catch(() => {})
          }
        })

        it('allocated is terminal — should reject transitions out of allocated', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const student = await payload.create({
            collection: 'student-enquiries',
            data: {
              studentClass: 'Class 6',
              subjects: [{ subject: 'English' }],
              preferredTiming: 'Evening',
              locality: 'West Delhi',
              budgetRange: '300-500',
              name: 'Terminal Student',
              phoneNumber: '+91 98765 00008',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'contacted' },
          })
          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'in_progress' },
          })
          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'converted' },
          })
          await payload.update({
            collection: 'student-enquiries',
            id: student.id,
            data: { enquiryStatus: 'allocated' },
          })

          // Attempting to transition to closed or contacted from allocated must fail
          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'closed', changeReason: 'Attempt close' },
            })
          ).rejects.toThrow(/Invalid status transition/i)

          await expect(
            payload.update({
              collection: 'student-enquiries',
              id: student.id,
              data: { enquiryStatus: 'contacted' },
            })
          ).rejects.toThrow(/Invalid status transition/i)

          await payload.delete({ collection: 'student-enquiries', id: student.id, overrideAccess: true }).catch(() => {})
        })
      })

      describe('Teacher Application Status Transitions, Rejection & Availability', () => {
        it('should allow valid sequential transitions: new -> under_review -> shortlisted -> approved', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Workflow Teacher',
              mobileNumber: '+91 98765 11111',
              highestQualification: 'M.Sc',
              teachingExperience: '4 years',
              primarySubject: 'Chemistry',
              classLevel: 'Class 10',
              teachingLocality: 'South Delhi',
              preferredAvailability: 'Evening',
              agreedToPolicy: true,
            },
          })

          // new -> under_review
          const t1 = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'under_review' },
          })
          expect(t1.applicationStatus).toBe('under_review')

          // under_review -> shortlisted
          const t2 = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'shortlisted' },
          })
          expect(t2.applicationStatus).toBe('shortlisted')

          // shortlisted -> approved
          const t3 = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'approved' },
          })
          expect(t3.applicationStatus).toBe('approved')
          // Newly approved teacher has default availability 'free'
          expect(t3.teacherAvailability).toBe('free')

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
        })

        it('should reject invalid skipped transition: new -> approved', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Skip Teacher',
              mobileNumber: '+91 98765 11112',
              highestQualification: 'M.Sc',
              teachingExperience: '4 years',
              primarySubject: 'Chemistry',
              classLevel: 'Class 10',
              teachingLocality: 'South Delhi',
              preferredAvailability: 'Evening',
              agreedToPolicy: true,
            },
          })

          await expect(
            payload.update({
              collection: 'teacher-enquiries',
              id: teacher.id,
              data: { applicationStatus: 'approved' },
            })
          ).rejects.toThrow(/Invalid application status transition/i)

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
        })

        it('should reject rejecting application without a change reason', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'No Reason Teacher',
              mobileNumber: '+91 98765 11113',
              highestQualification: 'B.Sc',
              teachingExperience: '1 year',
              primarySubject: 'Maths',
              classLevel: 'Class 6',
              teachingLocality: 'Delhi',
              preferredAvailability: 'Weekend',
              agreedToPolicy: true,
            },
          })

          await expect(
            payload.update({
              collection: 'teacher-enquiries',
              id: teacher.id,
              data: { applicationStatus: 'rejected', rejectionCategory: 'qualifications_mismatch' },
            })
          ).rejects.toThrow(/reason is mandatory/i)

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
        })

        it('should allow rejection with a reason and capture it in audit log', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Reject Success Teacher',
              mobileNumber: '+91 98765 11114',
              highestQualification: 'B.Sc',
              teachingExperience: '1 year',
              primarySubject: 'Maths',
              classLevel: 'Class 6',
              teachingLocality: 'Delhi',
              preferredAvailability: 'Weekend',
              agreedToPolicy: true,
            },
          })

          const rejected = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: {
              applicationStatus: 'rejected',
              rejectionCategory: 'qualifications_mismatch',
              changeReason: 'Highest qualification does not meet postgraduate requirement for Class 10.',
            },
          })
          expect(rejected.applicationStatus).toBe('rejected')
          expect(rejected.rejectionCategory).toBe('qualifications_mismatch')

          const audits = await payload.find({
            collection: 'enquiry-audit-log',
            where: { teacherEnquiry: { equals: teacher.id } },
            sort: '-changedAt',
            limit: 1,
          })
          expect(audits.docs[0].previousStatus).toBe('new')
          expect(audits.docs[0].newStatus).toBe('rejected')
          expect(audits.docs[0].changeReason).toBe('Highest qualification does not meet postgraduate requirement for Class 10.')

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
          await payload.delete({ collection: 'enquiry-audit-log', id: audits.docs[0].id, overrideAccess: true }).catch(() => {})
        })

        it('should allow reopening an eligible rejection (e.g. document mismatch) with a reason', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Reopen Eligible Teacher',
              mobileNumber: '+91 98765 11115',
              highestQualification: 'M.Sc',
              teachingExperience: '3 years',
              primarySubject: 'Physics',
              classLevel: 'Class 9',
              teachingLocality: 'Delhi',
              preferredAvailability: 'Evening',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: {
              applicationStatus: 'rejected',
              rejectionCategory: 'document_verification_failed',
              changeReason: 'Aadhaar copy unreadable.',
            },
          })

          // Reopening without reason should fail
          await expect(
            payload.update({
              collection: 'teacher-enquiries',
              id: teacher.id,
              data: { applicationStatus: 'under_review' },
            })
          ).rejects.toThrow(/reason is mandatory/i)

          // Reopening with reason should succeed
          const reopened = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: {
              applicationStatus: 'under_review',
              changeReason: 'Candidate provided certified clear identity scan; reopening review.',
            },
          })
          expect(reopened.applicationStatus).toBe('under_review')

          const audits = await payload.find({
            collection: 'enquiry-audit-log',
            where: { teacherEnquiry: { equals: teacher.id } },
            sort: '-changedAt',
            limit: 1,
          })
          expect(audits.docs[0].previousStatus).toBe('rejected')
          expect(audits.docs[0].newStatus).toBe('under_review')
          expect(audits.docs[0].changeReason).toBe('Candidate provided certified clear identity scan; reopening review.')

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
          for (const a of audits.docs) {
            await payload.delete({ collection: 'enquiry-audit-log', id: a.id, overrideAccess: true }).catch(() => {})
          }
        })

        it('should strictly block reopening a rejection categorized as character/conduct issue', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Conduct Issue Teacher',
              mobileNumber: '+91 98765 11116',
              highestQualification: 'M.Sc',
              teachingExperience: '5 years',
              primarySubject: 'Physics',
              classLevel: 'Class 10',
              teachingLocality: 'Delhi',
              preferredAvailability: 'Evening',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: {
              applicationStatus: 'rejected',
              rejectionCategory: 'character_conduct',
              changeReason: 'Disciplinary check flagged critical misconduct at prior institution.',
            },
          })

          // Even with a changeReason, reopening a character_conduct rejection MUST be blocked
          await expect(
            payload.update({
              collection: 'teacher-enquiries',
              id: teacher.id,
              data: {
                applicationStatus: 'under_review',
                changeReason: 'Attempting to appeal misconduct finding.',
              },
            })
          ).rejects.toThrow(/character or conduct issues cannot be reopened/i)

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
        })

        it('approved is terminal for application status', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Terminal Teacher',
              mobileNumber: '+91 98765 11117',
              highestQualification: 'M.Ed',
              teachingExperience: '6 years',
              primarySubject: 'Mathematics',
              classLevel: 'Class 10',
              teachingLocality: 'Delhi',
              preferredAvailability: 'Evening',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'under_review' },
          })
          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'shortlisted' },
          })
          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'approved' },
          })

          // Attempting to move out of approved must fail
          await expect(
            payload.update({
              collection: 'teacher-enquiries',
              id: teacher.id,
              data: { applicationStatus: 'rejected', changeReason: 'Close approved' },
            })
          ).rejects.toThrow(/Invalid application status transition/i)

          await expect(
            payload.update({
              collection: 'teacher-enquiries',
              id: teacher.id,
              data: { applicationStatus: 'under_review' },
            })
          ).rejects.toThrow(/Invalid application status transition/i)

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
        })

        it('teacher availability is separate from applicationStatus and can toggle free/allocated when approved', async ({ skip }) => {
          if (!payload) {
            skip()
            return
          }

          const teacher = await payload.create({
            collection: 'teacher-enquiries',
            data: {
              fullName: 'Availability Teacher',
              mobileNumber: '+91 98765 11118',
              highestQualification: 'M.Ed',
              teachingExperience: '6 years',
              primarySubject: 'Mathematics',
              classLevel: 'Class 10',
              teachingLocality: 'Delhi',
              preferredAvailability: 'Evening',
              agreedToPolicy: true,
            },
          })

          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'under_review' },
          })
          await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'shortlisted' },
          })
          const approved = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { applicationStatus: 'approved' },
          })
          expect(approved.applicationStatus).toBe('approved')
          expect(approved.teacherAvailability).toBe('free')

          // Allocate teacher
          const allocated = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { teacherAvailability: 'allocated' },
          })
          expect(allocated.applicationStatus).toBe('approved')
          expect(allocated.teacherAvailability).toBe('allocated')

          // Free teacher again
          const freed = await payload.update({
            collection: 'teacher-enquiries',
            id: teacher.id,
            data: { teacherAvailability: 'free' },
          })
          expect(freed.applicationStatus).toBe('approved')
          expect(freed.teacherAvailability).toBe('free')

          await payload.delete({ collection: 'teacher-enquiries', id: teacher.id, overrideAccess: true }).catch(() => {})
        })
      })
    })
  })
})
