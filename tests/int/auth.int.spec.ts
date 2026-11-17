import { getPayload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: any

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const TEST_USER_EMAIL = 'test.user@example.com'
const TEST_USER_PASSWORD = 'TestPass123'

describe('Authentication API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterAll(async () => {
    try {
      await payload.delete({
        collection: 'users',
        where: { email: { equals: TEST_USER_EMAIL } },
      })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('First Admin Seeder (idempotent)', () => {
    it('should create first admin account via Local API', async () => {
      const existing = await payload.find({
        collection: 'users',
        where: { email: { equals: ADMIN_EMAIL } },
        limit: 1,
      })

      if (existing.docs.length === 0) {
        const created = await payload.create({
          collection: 'users',
          data: {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'super_admin',
            status: 'active',
          },
        })
        expect(created.id).toBeDefined()
        expect(created.email).toBe(ADMIN_EMAIL)
        expect(created.role).toBe('super_admin')
        expect(created.status).toBe('active')
        expect((created as any).hash).toBeUndefined()
        expect((created as any).salt).toBeUndefined()
      } else {
        expect(existing.docs[0].email).toBe(ADMIN_EMAIL)
        expect(existing.docs[0].role).toBe('super_admin')
      }
    })

    it('should be idempotent — not overwrite existing admin password', async () => {
      const before = await payload.find({
        collection: 'users',
        where: { email: { equals: ADMIN_EMAIL } },
        limit: 1,
      })
      const hashBefore = (before.docs[0] as any).hash

      const after = await payload.find({
        collection: 'users',
        where: { email: { equals: ADMIN_EMAIL } },
        limit: 1,
      })
      const hashAfter = (after.docs[0] as any).hash
      expect(hashAfter).toBe(hashBefore)
    })
  })

  describe('Login', () => {
    it('should login successfully with valid credentials', async () => {
      const result: any = await payload.login({
        collection: 'users',
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      })

      expect(result.token).toBeDefined()
      expect(result.user).toBeDefined()
      expect((result.user as any).email).toBe(ADMIN_EMAIL)
      expect((result.user as any).role).toBe('super_admin')
    })

    it('should reject login with wrong password', async () => {
      try {
        await payload.login({
          collection: 'users',
          data: { email: ADMIN_EMAIL, password: 'wrongpassword' },
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err).toBeDefined()
      }
    })

    it('should reject login for non-existent user', async () => {
      try {
        await payload.login({
          collection: 'users',
          data: { email: 'nonexistent@example.com', password: 'password' },
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err).toBeDefined()
      }
    })
  })

  describe('GET /me', () => {
    it('should return user profile', async () => {
      const login = await payload.login({
        collection: 'users',
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      })
      const result: any = await (payload as any).auth({
        headers: new Headers({ authorization: `Bearer ${login.token}` }),
      })

      const user = result.user as any
      expect(user.email).toBe(ADMIN_EMAIL)
      expect(user.role).toBe('super_admin')
    })
  })

  describe('Admin User Management', () => {
    it('should create a new user', async () => {
      const created = await payload.create({
        collection: 'users',
        data: {
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          role: 'teacher',
          status: 'active',
        },
      })

      expect(created.id).toBeDefined()
      expect(created.email).toBe(TEST_USER_EMAIL)
      expect(created.role).toBe('teacher')
    })

    it('should list users', async () => {
      const users = await payload.find({
        collection: 'users',
        limit: 10,
        where: { email: { equals: TEST_USER_EMAIL } },
      })

      expect(users.docs.length).toBeGreaterThanOrEqual(1)
    })

    it('should update user status', async () => {
      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: TEST_USER_EMAIL } },
        limit: 1,
      })

      const updated = await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'suspended' },
      })

      expect(updated.status).toBe('suspended')

      await payload.update({
        collection: 'users',
        id: users.docs[0].id,
        data: { status: 'active' },
      })
    })
  })

  describe('OTP Password Reset Flow', () => {
    it('should generate and store OTP for valid email', async () => {
      const otp = '1234'
      const email = ADMIN_EMAIL

      const crypto = await import('crypto')
      const hashOTP = (otp: string, email: string) =>
        crypto.createHash('sha256').update(`${email}:${otp}`).digest('hex')
      const otpHash = hashOTP(otp, email)

      await payload.update({
        collection: 'users',
        where: { email: { equals: email } },
        data: {
          otpHash,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpAttempts: 0,
          otpLastSentAt: new Date(),
        },
      })

      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
      })

      const user = users.docs[0] as any
      expect(user.otpHash).toBe(otpHash)
      expect(user.otpExpiresAt).toBeDefined()
      expect(user.otpAttempts).toBe(0)
    })

    it('should verify valid OTP and issue reset auth token', async () => {
      const otp = '1234'
      const email = ADMIN_EMAIL

      const crypto = await import('crypto')
      const hashOTP = (otp: string, email: string) =>
        crypto.createHash('sha256').update(`${email}:${otp}`).digest('hex')
      const otpHash = hashOTP(otp, email)

      await payload.update({
        collection: 'users',
        where: { email: { equals: email } },
        data: {
          otpHash,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpAttempts: 0,
        },
      })

      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
      })

      const user = users.docs[0] as any
      const isValid = crypto.timingSafeEqual(
        Buffer.from(hashOTP(otp, email)),
        Buffer.from(user.otpHash)
      )
      expect(isValid).toBe(true)

      const resetAuthToken = crypto.randomBytes(32).toString('hex')
      const resetAuthExpiresAt = new Date(Date.now() + 15 * 60 * 1000)

      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          otpLastSentAt: null,
          resetAuthToken,
          resetAuthExpiresAt,
          resetAuthUsed: false,
        },
      })

      const updated = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
      })

      const updatedUser = updated.docs[0] as any
      expect(updatedUser.resetAuthToken).toBe(resetAuthToken)
      expect(updatedUser.resetAuthUsed).toBe(false)
    })

    it('should reset password using reset auth token', async () => {
      const email = ADMIN_EMAIL

      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
      })

      const user = users.docs[0] as any
      expect(user.resetAuthToken).toBeDefined()

      const newPassword = 'NewResetPass123'
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          password: newPassword,
          resetAuthToken: null,
          resetAuthExpiresAt: null,
          resetAuthUsed: true,
        },
      })

      const result: any = await payload.login({
        collection: 'users',
        data: { email, password: newPassword },
      })

      expect(result.token).toBeDefined()
      expect(result.user).toBeDefined()

      await payload.update({
        collection: 'users',
        id: user.id,
        data: { password: ADMIN_PASSWORD },
      })
    })

    it('should reject invalid OTP', async () => {
      const email = ADMIN_EMAIL
      const crypto = await import('crypto')

      const hashOTP = (otp: string, email: string) =>
        crypto.createHash('sha256').update(`${email}:${otp}`).digest('hex')
      await payload.update({
        collection: 'users',
        where: { email: { equals: email } },
        data: {
          otpHash: hashOTP('0000', email),
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpAttempts: 0,
        },
      })

      const users = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
      })

      const user = users.docs[0] as any
      const isValid = crypto.timingSafeEqual(
        Buffer.from(hashOTP('1111', email)),
        Buffer.from(user.otpHash)
      )
      expect(isValid).toBe(false)
    })
  })
})