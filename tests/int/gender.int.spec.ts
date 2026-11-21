import { afterAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST } from '@/app/api/student-enquiries/route'

const ids: number[] = []
const body = (extra: Record<string, unknown>) =>
  new Request('http://localhost:3000/api/student-enquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Gender Spec', phoneNumber: '9876500011', studentClass: 'Class 7', subjects: ['Maths'], preferredTiming: 'Evening', locality: 'Kankarbagh', budgetRange: 'Rs 2000', agreedToPolicy: true, ...extra }),
  })

describe('gender fields on student enquiries', () => {
  afterAll(async () => {
    const payload: any = await getPayload({ config: await config })
    for (const id of ids) await payload.delete({ collection: 'student-enquiries', id, overrideAccess: true }).catch(() => undefined)
  })

  it('stores student gender and teacher preference', async () => {
    const res = await POST(body({ studentGender: 'female', preferredTeacherGender: 'female' }))
    expect(res.status).toBe(201)
    const json: any = await res.json()
    const id = json.enquiry?.id ?? json.data?.id
    ids.push(id)
    const payload: any = await getPayload({ config: await config })
    const doc = await payload.findByID({ collection: 'student-enquiries', id, overrideAccess: true })
    expect(doc.studentGender).toBe('female')
    expect(doc.preferredTeacherGender).toBe('female')
  })

  it('rejects an invalid gender', async () => {
    expect((await POST(body({ studentGender: 'robot' }))).status).toBe(400)
    expect((await POST(body({ preferredTeacherGender: 'robot' }))).status).toBe(400)
  })
})
