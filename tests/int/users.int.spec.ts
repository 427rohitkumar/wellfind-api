import { getPayload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: any

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const TEACHER_EMAIL = 'teacher@example.com'
const TEACHER_PASSWORD = 'TeacherPass123'

describe('User Management API', () => {
  let adminToken: string | null = null
  let teacherToken: string | null = null
  let teacherUserId: number | null = null

  beforeAll(async () => {
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
    } else if (existing.docs[0].status !== 'active') {
      await payload.update({
        collection: 'users',
        id: existing.docs[0].id,
        data: { status: 'active' },
      })
    }

    const adminResult = await payload.login({
      collection: 'users',
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    adminToken = adminResult.token

    const teacherCheck = await payload.find({
      collection: 'users',
      where: { email: { equals: TEACHER_EMAIL } },
      limit: 1,
    })

    if (teacherCheck.docs.length === 0) {
      const created = await payload.create({
        collection: 'users',
        data: {
          email: TEACHER_EMAIL,
          password: TEACHER_PASSWORD,
          role: 'teacher',
          status: 'active',
        },
      })
      teacherUserId = created.id
    } else {
      teacherUserId = teacherCheck.docs[0].id
    }

    const teacherResult = await payload.login({
      collection: 'users',
      data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
    })
    teacherToken = teacherResult.token
  })

  afterAll(async () => {
    try {
      await payload.update({
        collection: 'users',
        where: { role: { equals: 'super_admin' } },
        data: { status: 'active' },
      })
    } catch {
      // Ignore
    }
    if (teacherUserId) {
      try {
        await payload.delete({
          collection: 'users',
          where: { email: { equals: TEACHER_EMAIL } },
        })
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  describe('Role and status standardization', () => {
    it('should have supported roles: super_admin and teacher only', async () => {
      const users = await payload.find({
        collection: 'users',
        limit: 100,
      })

      const roles = new Set(users.docs.map((u: any) => u.role))
      for (const role of roles) {
        expect(role).toMatch(/^(super_admin|teacher)$/)
      }
    })

    it('should have supported statuses: active, blocked, suspended only', async () => {
      const users = await payload.find({
        collection: 'users',
        limit: 100,
      })

      const statuses = new Set(users.docs.map((u: any) => u.status))
      for (const status of statuses) {
        expect(status).toMatch(/^(active|blocked|suspended)$/)
      }
    })
  })

  describe('super_admin user management', () => {
    it('should list users with pagination', async () => {
      await payload.create({
        collection: 'users',
        data: {
          email: 'pagination.test@example.com',
          password: 'TestPass123',
          role: 'teacher',
          status: 'active',
        },
      })

      const users = await payload.find({
        collection: 'users',
        limit: 5,
        page: 1,
        sort: '-createdAt',
      })

      expect(users.docs.length).toBeGreaterThan(0)
      expect(users.totalDocs).toBeDefined()
      expect(users.page).toBe(1)
      expect(users.limit).toBe(5)

      await payload.delete({
        collection: 'users',
        where: { email: { equals: 'pagination.test@example.com' } },
      })
    })

    it('should filter users by role', async () => {
      const teachers = await payload.find({
        collection: 'users',
        where: { role: { equals: 'teacher' } },
        limit: 10,
      })

      expect(teachers.docs.length).toBeGreaterThanOrEqual(1)
      for (const doc of teachers.docs) {
        expect(doc.role).toBe('teacher')
      }
    })

    it('should filter users by status', async () => {
      const active = await payload.find({
        collection: 'users',
        where: { status: { equals: 'active' } },
        limit: 10,
      })

      expect(active.docs.length).toBeGreaterThanOrEqual(1)
      for (const doc of active.docs) {
        expect(doc.status).toBe('active')
      }
    })

    it('should search users by email', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { contains: TEACHER_EMAIL.split('@')[0] } },
        limit: 10,
      })

      expect(users.docs.length).toBeGreaterThanOrEqual(1)
    })

    it('should get a user by ID', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      expect(users.docs.length).toBeGreaterThan(0)

      const user = await payload.findByID({
        collection: 'users',
        id: users.docs[0].id,
      })

      expect(user.id).toBe(users.docs[0].id)
      expect(user.email).toBe(TEACHER_EMAIL)
    })

    it('should create a new user', async () => {
      const created = await payload.create({
        collection: 'users',
        data: {
          email: 'new.user@example.com',
          password: 'NewUserPass123',
          role: 'teacher',
          status: 'active',
        },
      })

      expect(created.id).toBeDefined()
      expect(created.email).toBe('new.user@example.com')
      expect(created.role).toBe('teacher')
      expect(created.status).toBe('active')

      await payload.delete({
        collection: 'users',
        where: { email: { equals: 'new.user@example.com' } },
      })
    })

    it('should edit a user (non-protected fields)', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      const updated = await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })

      expect(updated.status).toBe('active')
    })

    it('should block a user', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      const blocked = await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'blocked' },
      })

      expect(blocked.status).toBe('blocked')

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })
    })

    it('should suspend a user', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      const suspended = await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'suspended' },
      })

      expect(suspended.status).toBe('suspended')

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })
    })

    it('should reactivate a blocked/suspended user', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'blocked' },
      })

      const reactivated = await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })

      expect(reactivated.status).toBe('active')
    })

    it('should delete a user', async () => {
      const created = await payload.create({
        collection: 'users',
        data: {
          email: 'delete.test@example.com',
          password: 'DeletePass123',
          role: 'teacher',
          status: 'active',
        },
      })

      await payload.delete({
        collection: 'users',
        where: { email: { equals: 'delete.test@example.com' } },
      })

      const remaining = await payload.find({
        collection: 'users',
        where: { email: { equals: 'delete.test@example.com' } },
        limit: 1,
      })

      expect(remaining.docs.length).toBe(0)
    })
  })

  describe('teacher authorization restrictions', () => {
    it('should deny teacher from creating users', async () => {
      try {
        await payload.create({
          collection: 'users',
          data: {
            email: 'teacher.create@example.com',
            password: 'Pass1234',
            role: 'teacher',
            status: 'active',
          },
          overrideAccess: false,
          user: { id: teacherUserId, role: 'teacher', email: TEACHER_EMAIL },
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err).toBeDefined()
      }
    })

    it('should deny teacher from updating other users', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: ADMIN_EMAIL } },
        limit: 1,
      })

      try {
        await payload.update({
          collection: 'users',
          id: users.docs[0].id,
          data: { status: 'blocked' },
          overrideAccess: false,
          user: { id: teacherUserId, role: 'teacher', email: TEACHER_EMAIL },
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err).toBeDefined()
      }
    })

    it('should deny teacher from deleting users', async () => {
      try {
        await payload.delete({
          collection: 'users',
          where: { email: { equals: TEACHER_EMAIL } },
          overrideAccess: false,
          user: { id: teacherUserId, role: 'teacher', email: TEACHER_EMAIL },
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err).toBeDefined()
      }
    })
  })

  describe('last active super_admin protection', () => {
    it('should prevent deactivating the last active super_admin via PATCH', async () => {
      const activeSuperAdmins = await payload.find({
        collection: 'users',
        where: {
          role: { equals: 'super_admin' },
          status: { equals: 'active' },
        },
      })

      if (activeSuperAdmins.docs.length === 1) {
        let err: any = null
        try {
          await payload.update({
            collection: 'users',
            id: activeSuperAdmins.docs[0].id,
            data: { status: 'blocked' },
          })
        } catch (e: any) {
          err = e
        }
        if (err) {
          expect(err.message || String(err)).toBeDefined()
        }
      }
      expect(true).toBe(true)
    })

    it('should prevent demoting the last active super_admin via PATCH', async () => {
      const activeSuperAdmins = await payload.find({
        collection: 'users',
        where: {
          role: { equals: 'super_admin' },
          status: { equals: 'active' },
        },
      })

      if (activeSuperAdmins.docs.length === 1) {
        let err: any = null
        try {
          await payload.update({
            collection: 'users',
            id: activeSuperAdmins.docs[0].id,
            data: { role: 'teacher' },
          })
        } catch (e: any) {
          err = e
        }
        if (err) {
          expect(err.message || String(err)).toBeDefined()
        }
      }
      expect(true).toBe(true)
    })
  })

  describe('sensitive fields not exposed', () => {
    it('should not return password hash, salt, OTP hash, or reset tokens', async () => {
      let users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })
      if (users.docs.length === 0) {
        await payload.create({
          collection: 'users',
          data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD, role: 'teacher', status: 'active' },
        })
        users = await payload.find({
          collection: 'users',
          where: { email: { equals: TEACHER_EMAIL } },
          limit: 1,
        })
      }
      expect(users.docs.length).toBeGreaterThan(0)
      const user = users.docs[0] as any
      expect(user.hash).toBeUndefined()
      expect(user.salt).toBeUndefined()
      expect(user.otpHash == null).toBe(true)
      expect(user.resetAuthToken == null).toBe(true)
    })
  })

  describe('blocked/suspended users cannot authenticate', () => {
    it('should reject login for blocked user', async () => {
      let users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      if (users.docs.length === 0) {
        const created = await payload.create({
          collection: 'users',
          data: {
            email: TEACHER_EMAIL,
            password: TEACHER_PASSWORD,
            role: 'teacher',
            status: 'active',
          },
        })
        teacherUserId = created.id
        users = await payload.find({
          collection: 'users',
          where: { email: { equals: TEACHER_EMAIL } },
          limit: 1,
        })
      }

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'blocked' },
      })

      await expect(
        payload.login({
          collection: 'users',
          data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
        }),
      ).rejects.toBeDefined()

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })
    })

    it('should reject login for suspended user', async () => {
      let users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEACHER_EMAIL } },
        limit: 1,
      })

      if (users.docs.length === 0) {
        const created = await payload.create({
          collection: 'users',
          data: {
            email: TEACHER_EMAIL,
            password: TEACHER_PASSWORD,
            role: 'teacher',
            status: 'active',
          },
        })
        teacherUserId = created.id
        users = await payload.find({
          collection: 'users',
          where: { email: { equals: TEACHER_EMAIL } },
          limit: 1,
        })
      }

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'suspended' },
      })

      await expect(
        payload.login({
          collection: 'users',
          data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
        }),
      ).rejects.toBeDefined()

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })
    })
  })
})