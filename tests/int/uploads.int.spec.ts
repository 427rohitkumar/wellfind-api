import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST, GET } from '@/app/api/uploads/route'
import { DELETE as DELETE_AVATAR } from '@/app/api/uploads/avatar/route'
import { DELETE as DELETE_FILE } from '@/app/api/uploads/[id]/route'

const PASSWORD = 'UploadSpecPass123!'
const ADMIN = 'upload-spec-admin@example.com'
const TEACHER = 'upload-spec-teacher@example.com'
let payload: any
let adminToken = ''
let teacherToken = ''
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

function form(parts: Record<string, string | { data: Buffer; name: string; type: string }>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(parts)) {
    if (typeof v === 'string') f.append(k, v)
    else f.append(k, new File([new Uint8Array(v.data)], v.name, { type: v.type }))
  }
  return f
}
const req = (token: string | null, method: string, body?: FormData) =>
  new Request('http://localhost:3000/api/uploads', { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(body ? { body } : {}) })

async function ensureUser(email: string, role: 'super_admin' | 'teacher') {
  const ex = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
  if (!ex.docs[0]) await payload.create({ collection: 'users', data: { email, password: PASSWORD, role, status: 'active' }, overrideAccess: true })
  return (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token as string
}

describe('uploads (avatar + documents)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    adminToken = await ensureUser(ADMIN, 'super_admin')
    teacherToken = await ensureUser(TEACHER, 'teacher')
  })
  afterAll(async () => {
    for (const email of [ADMIN, TEACHER]) {
      const u = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
      if (u.docs[0]) {
        const id = u.docs[0].id
        await payload.delete({ collection: 'user-files', where: { owner: { equals: id } }, overrideAccess: true }).catch(() => undefined)
        await payload.delete({ collection: 'media', where: { owner: { equals: id } }, overrideAccess: true }).catch(() => undefined)
        await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
      }
    }
  })

  it('requires sign-in', async () => {
    expect((await POST(req(null, 'POST', form({ purpose: 'avatar', file: { data: PNG, name: 'a.png', type: 'image/png' } })))).status).toBe(401)
  })

  it('updates an admin profile photo and replaces the old one', async () => {
    const r1: any = await (await POST(req(adminToken, 'POST', form({ purpose: 'avatar', file: { data: PNG, name: 'me.png', type: 'image/png' } })))).json()
    expect(r1.data.avatar).toBeTruthy()
    const r2: any = await (await POST(req(adminToken, 'POST', form({ purpose: 'avatar', file: { data: PNG, name: 'me2.png', type: 'image/png' } })))).json()
    expect(r2.data.avatar).not.toBe(r1.data.avatar)
    const u = await payload.find({ collection: 'users', where: { email: { equals: ADMIN } }, limit: 1, overrideAccess: true })
    expect(u.docs[0].avatar).toBe(r2.data.avatar)
    const media = await payload.find({ collection: 'media', where: { owner: { equals: u.docs[0].id } }, overrideAccess: true })
    expect(media.totalDocs).toBe(1)
    const del: any = await (await DELETE_AVATAR(req(adminToken, 'DELETE'))).json()
    expect(del.data.avatar).toBeNull()
  })

  it('rejects a PDF as an avatar and a disguised file as anything', async () => {
    expect((await POST(req(teacherToken, 'POST', form({ purpose: 'avatar', file: { data: PDF, name: 'x.pdf', type: 'application/pdf' } })))).status).toBe(400)
    expect((await POST(req(teacherToken, 'POST', form({ purpose: 'document', file: { data: Buffer.from('MZ not an image'), name: 'evil.png', type: 'image/png' } })))).status).toBe(400)
  })

  it('stores private documents per owner', async () => {
    const up: any = await (await POST(req(teacherToken, 'POST', form({ purpose: 'document', label: 'Degree', file: { data: PDF, name: 'degree.pdf', type: 'application/pdf' } })))).json()
    expect(up.data.mimeType).toBe('application/pdf')
    expect(up.data.label).toBe('Degree')
    const mine: any = await (await GET(req(teacherToken, 'GET'))).json()
    expect(mine.data.docs).toHaveLength(1)
    // another user cannot see or delete it
    const other: any = await (await GET(req(adminToken, 'GET'))).json()
    expect(other.data.docs).toHaveLength(0)
    const denied = await DELETE_FILE(new Request('http://localhost:3000/x', { method: 'DELETE', headers: { Authorization: `Bearer ${teacherToken}` } }), ctx(999999))
    expect(denied.status).toBe(404)
    const ok = await DELETE_FILE(new Request('http://localhost:3000/x', { method: 'DELETE', headers: { Authorization: `Bearer ${teacherToken}` } }), ctx(up.data.id))
    expect(ok.status).toBe(200)
  })
})
