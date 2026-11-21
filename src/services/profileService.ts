import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { isValidTeacherPhoneNumber, normalizeTeacherPhoneNumber } from '@/collections/TeacherEnquiries'
import { ServiceError } from '@/services/studentService'
import { findTeacherProfileForUser } from '@/services/teacherAllocationService'

/**
 * "My profile" for the signed-in user (admin or teacher).
 *
 * Editable: name, phone/mobile, gender, and (teachers) locality, availability, class levels, about.
 * NOT editable here: email (it is the login credential), role, status, and a teacher's verified
 * qualification / subject / experience (changing those goes through the admin team).
 */

const GENDERS = ['male', 'female', 'other']
const bad = (field: string, message: string) => new ServiceError(message, 400, [{ field, message }])

function text(body: Record<string, unknown>, key: string, max: number, required = false): string | undefined {
  const v = body[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') throw bad(key, `${key} must be text.`)
  const t = v.trim()
  if (required && !t) throw bad(key, `${key} cannot be empty.`)
  if (t.length > max) throw bad(key, `${key} must be at most ${max} characters.`)
  return t
}

function gender(body: Record<string, unknown>): string | null | undefined {
  const v = body.gender
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !GENDERS.includes(v)) throw bad('gender', "gender must be 'male', 'female' or 'other'.")
  return v
}

function phone(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string' || !isValidTeacherPhoneNumber(v)) throw bad(key, 'Enter a valid phone number (7-15 digits, optional leading +).')
  return normalizeTeacherPhoneNumber(v)
}

export async function getMyProfile(payload: Payload, user: AuthUserRecord) {
  const u = (await (payload as any).findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })) as Record<string, any>
  const base = {
    email: u.email,
    role: u.role,
    name: u.fullName ?? null,
    phone: u.phone ?? null,
    gender: u.gender ?? null,
    avatar: u.avatar ?? null,
  }
  if (u.role !== 'teacher') return { ...base, teacher: null }
  const p = await findTeacherProfileForUser(payload, user.id)
  if (!p) return { ...base, teacher: null }
  return {
    ...base,
    name: p.name,
    phone: p.mobile,
    gender: p.gender ?? u.gender ?? null,
    avatar: p.avatar ?? u.avatar ?? null,
    teacher: {
      locality: p.locality ?? '',
      availability: p.availability ?? '',
      classLevels: p.classLevels ?? '',
      about: p.about ?? '',
      qualification: p.qualification ?? null,
      primarySubject: p.primarySubject ?? null,
      experienceYears: p.experienceYears ?? 0,
    },
  }
}

export async function updateMyProfile(payload: Payload, user: AuthUserRecord, body: Record<string, unknown>) {
  if (body.email !== undefined || body.role !== undefined || body.status !== undefined) {
    // Be explicit instead of silently ignoring: the email is the login credential.
    const current = (await (payload as any).findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })) as Record<string, any>
    const sameEmail = body.email === undefined || String(body.email).trim().toLowerCase() === String(current.email).toLowerCase()
    if (!sameEmail) throw bad('email', 'Your email is your login and cannot be changed here.')
    if (body.role !== undefined || body.status !== undefined) throw bad('role', 'Role and status cannot be changed here.')
  }

  const name = text(body, 'name', 100, true)
  const g = gender(body)

  if (user.role === 'teacher') {
    const p = await findTeacherProfileForUser(payload, user.id)
    if (!p) throw new ServiceError('No teacher profile is linked to this account.', 403)
    const mobile = phone(body, 'phone') ?? phone(body, 'mobile')
    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (mobile !== undefined) data.mobile = mobile
    if (g !== undefined) data.gender = g
    const locality = text(body, 'locality', 200, true)
    if (locality !== undefined) data.locality = locality
    const availability = text(body, 'availability', 200, true)
    if (availability !== undefined) data.availability = availability
    const classLevels = text(body, 'classLevels', 200)
    if (classLevels !== undefined) data.classLevels = classLevels || 'All Levels'
    const about = text(body, 'about', 1000)
    if (about !== undefined) data.about = about
    if (Object.keys(data).length === 0) throw bad('body', 'Nothing to update.')
    if (mobile !== undefined && mobile !== p.mobile) {
      const dup = await (payload as any).find({ collection: 'teacher-profiles', where: { and: [{ mobile: { equals: mobile } }, { id: { not_equals: p.id } }] }, limit: 1, depth: 0, overrideAccess: true })
      if (dup.docs.length > 0) throw bad('phone', 'This mobile number is already used by another teacher.')
    }
    await (payload as any).update({ collection: 'teacher-profiles', id: p.id, data, overrideAccess: true })
    // Keep the login record's display fields in step.
    await (payload as any).update({ collection: 'users', id: user.id, data: { ...(name !== undefined ? { fullName: name } : {}), ...(mobile !== undefined ? { phone: mobile } : {}), ...(g !== undefined ? { gender: g } : {}) }, overrideAccess: true })
  } else {
    const ph = phone(body, 'phone')
    const data: Record<string, unknown> = {}
    if (name !== undefined) data.fullName = name
    if (ph !== undefined) data.phone = ph
    if (g !== undefined) data.gender = g
    if (Object.keys(data).length === 0) throw bad('body', 'Nothing to update.')
    await (payload as any).update({ collection: 'users', id: user.id, data, overrideAccess: true })
  }
  return getMyProfile(payload, user)
}
