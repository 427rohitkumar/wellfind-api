import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { ServiceError } from '@/services/studentService'
import { findTeacherProfileForUser } from '@/services/teacherAllocationService'
import { canRead } from '@/lib/permissions'

/**
 * File & image uploads for signed-in users (admin and teacher), stored through Payload
 * (Cloudinary when configured, local disk otherwise).
 *
 *  purpose=avatar    image only, max 5 MB, public. Updates the caller's profile photo.
 *  purpose=document  PDF or image, max 10 MB, private (owner + super admin).
 */

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

type Kind = 'jpeg' | 'png' | 'webp' | 'pdf'
const MIME: Record<Kind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }
const EXT: Record<Kind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', pdf: 'pdf' }

/** Detects the real type from the file's first bytes (the browser-sent type can be faked). */
export function sniffKind(buf: Buffer): Kind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp'
  if (buf.length >= 5 && buf.subarray(0, 5).toString() === '%PDF-') return 'pdf'
  return null
}

const bad = (field: string, message: string, status = 400) => new ServiceError(message, status, [{ field, message }])

function safeName(original: string, kind: Kind) {
  const base = original.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file'
  return `${base}.${EXT[kind]}`
}

async function readFile(formData: FormData, purpose: 'avatar' | 'document') {
  const value = formData.get('file')
  if (!(value instanceof File) || value.size === 0) throw bad('file', 'Choose a file to upload.')
  const max = purpose === 'avatar' ? MAX_AVATAR_BYTES : MAX_DOCUMENT_BYTES
  if (value.size > max) throw bad('file', `The file must be ${max / 1024 / 1024} MB or smaller.`)
  const buffer = Buffer.from(await value.arrayBuffer())
  const kind = sniffKind(buffer)
  if (!kind || (purpose === 'avatar' && kind === 'pdf')) {
    throw bad('file', purpose === 'avatar' ? 'Profile photos must be a JPG, PNG or WebP image.' : 'Allowed files: PDF, JPG, PNG or WebP.')
  }
  return { buffer, kind, original: value.name }
}

export function serializeUserFile(doc: Record<string, any>) {
  return {
    id: doc.id,
    label: doc.label ?? doc.filename,
    category: doc.category ?? null,
    filename: doc.filename,
    mimeType: doc.mimeType,
    size: doc.filesize ?? null,
    url: doc.url ?? null,
    createdAt: doc.createdAt,
  }
}

/** Returns the stored avatar URL for a user, or null. */
async function removeOldAvatar(payload: Payload, url: unknown, ownerId: number) {
  if (typeof url !== 'string' || !url) return
  const res = await (payload as any).find({ collection: 'media', where: { and: [{ url: { equals: url } }, { owner: { equals: ownerId } }] }, limit: 5, depth: 0, overrideAccess: true })
  for (const doc of res.docs) await (payload as any).delete({ collection: 'media', id: doc.id, overrideAccess: true }).catch(() => undefined)
}

export async function uploadAvatar(payload: Payload, user: AuthUserRecord, formData: FormData) {
  const { buffer, kind, original } = await readFile(formData, 'avatar')
  const created = await (payload as any).create({
    collection: 'media',
    data: { alt: `Profile photo (${user.email})`, kind: 'avatar', owner: user.id },
    file: { data: buffer, name: `avatar-${user.id}-${Date.now()}.${EXT[kind]}`, mimetype: MIME[kind], size: buffer.length },
    overrideAccess: true,
  })
  const url: string = created.url

  const me = await (payload as any).findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })
  const profile = user.role === 'teacher' ? await findTeacherProfileForUser(payload, user.id) : null
  await (payload as any).update({ collection: 'users', id: user.id, data: { avatar: url }, overrideAccess: true })
  if (profile) await (payload as any).update({ collection: 'teacher-profiles', id: profile.id, data: { avatar: url }, overrideAccess: true })

  await removeOldAvatar(payload, me?.avatar, user.id)
  if (profile?.avatar && profile.avatar !== me?.avatar) await removeOldAvatar(payload, profile.avatar, user.id)
  void original
  return { avatar: url }
}

export async function removeAvatar(payload: Payload, user: AuthUserRecord) {
  const me = await (payload as any).findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })
  const profile = user.role === 'teacher' ? await findTeacherProfileForUser(payload, user.id) : null
  await (payload as any).update({ collection: 'users', id: user.id, data: { avatar: null }, overrideAccess: true })
  if (profile) await (payload as any).update({ collection: 'teacher-profiles', id: profile.id, data: { avatar: null }, overrideAccess: true })
  await removeOldAvatar(payload, me?.avatar, user.id)
  if (profile?.avatar) await removeOldAvatar(payload, profile.avatar, user.id)
  return { avatar: null }
}

export async function uploadDocument(payload: Payload, user: AuthUserRecord, formData: FormData) {
  const { buffer, kind, original } = await readFile(formData, 'document')
  const label = String(formData.get('label') || '').trim().slice(0, 200) || original.slice(0, 200)
  const category = String(formData.get('category') || '').trim().slice(0, 60) || undefined
  const created = await (payload as any).create({
    collection: 'user-files',
    data: { owner: user.id, label, ...(category ? { category } : {}) },
    file: { data: buffer, name: safeName(original, kind), mimetype: MIME[kind], size: buffer.length },
    overrideAccess: true,
  })
  return serializeUserFile(created)
}

export async function listOwnDocuments(payload: Payload, user: AuthUserRecord, ownerId?: number) {
  // Super admins may look at another user's files; everyone else sees only their own.
  const mayLookup = user.role === 'super_admin' || canRead(user, 'teachers') || canRead(user, 'teacher_inquiries')
  const target = mayLookup && ownerId ? ownerId : user.id
  const res = await (payload as any).find({
    collection: 'user-files',
    where: { owner: { equals: target } },
    sort: '-createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const own = (res.docs as Record<string, any>[]).map((d) => ({ ...serializeUserFile(d), source: 'profile' as const }))

  // A teacher's application documents (Aadhaar, degree) are part of their documents too.
  const enq = await (payload as any).find({ collection: 'teacher-enquiries', where: { teacherUser: { equals: target } }, limit: 1, depth: 1, overrideAccess: true })
  const app = enq.docs[0] as Record<string, any> | undefined
  const application = app
    ? ([['aadhaarDocument', 'Aadhaar card'], ['qualificationDocument', 'Highest degree certificate']] as const)
        .map(([key, label]) => {
          const d = app[key]
          return d && typeof d === 'object'
            ? { id: `app-${key}`, label, category: 'application', filename: d.filename, mimeType: d.mimeType, size: d.filesize ?? null, url: d.url ?? null, createdAt: d.createdAt, source: 'application' as const }
            : null
        })
        .filter(Boolean)
    : []
  return { docs: [...application, ...own] }
}

export async function deleteOwnDocument(payload: Payload, user: AuthUserRecord, id: number) {
  const doc = await (payload as any).findByID({ collection: 'user-files', id, depth: 0, disableErrors: true, overrideAccess: true })
  if (!doc) throw new ServiceError('File not found.', 404)
  const ownerId = typeof doc.owner === 'object' ? doc.owner?.id : doc.owner
  if (user.role !== 'super_admin' && ownerId !== user.id) throw new ServiceError('File not found.', 404)
  await (payload as any).delete({ collection: 'user-files', id, overrideAccess: true })
  return { id }
}
