import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { extractRelationId } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'
import { gatewayInfo, listOwnPayments } from '@/services/paymentQueries'
import { registrationState } from '@/services/registrationRenewal'
import {
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_SIZE_BYTES,
} from '@/collections/TeacherEnquiries'

/** Stages a teacher sees, in order. `payment` sits between shortlisting and approval. */
export const APPLICATION_STEPS = ['under_review', 'shortlisted', 'payment', 'approved'] as const

const PAYMENT_STATUSES = ['shortlisted', 'evaluation_completed']
export const REGISTRATION_FEE_INR = 1000

export const teacherPaymentMethods = ['upi', 'bank_transfer', 'other'] as const

/** Finds the application belonging to a logged-in teacher (by login link, or via their profile). */
export async function findOwnApplication(
  payload: Payload,
  user: AuthUserRecord,
): Promise<Record<string, any>> {
  if (user.role !== 'teacher') {
    throw new ServiceError('This area is for teacher accounts only.', 403)
  }

  const direct = await (payload as any).find({
    collection: 'teacher-enquiries',
    where: { teacherUser: { equals: user.id } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  if (direct.docs[0]) {
    await claimDocuments(payload, direct.docs[0], user.id)
    return direct.docs[0]
  }

  // Teachers approved before the login link existed: go through their profile.
  const profile = await (payload as any).find({
    collection: 'teacher-profiles',
    where: { user: { equals: user.id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const enquiryId = extractRelationId(profile.docs[0]?.teacherEnquiry)
  if (enquiryId) {
    const doc = await (payload as any).findByID({
      collection: 'teacher-enquiries',
      id: enquiryId,
      depth: 1,
      disableErrors: true,
      overrideAccess: true,
    })
    if (doc) {
      await claimDocuments(payload, doc, user.id)
      return doc
    }
  }
  throw new ServiceError('No teacher application is linked to this account.', 404)
}

/** Documents sent with the public application form have no owner yet: give them to the teacher so they can open them. */
async function claimDocuments(payload: Payload, enquiry: Record<string, any>, userId: number) {
  for (const key of ['aadhaarDocument', 'qualificationDocument']) {
    const d = enquiry[key]
    if (d && typeof d === 'object' && !d.owner) {
      await (payload as any).update({ collection: 'teacher-documents', id: d.id, data: { owner: userId }, overrideAccess: true }).catch(() => undefined)
      d.owner = userId
    }
  }
}

function paymentInstructions() {
  const upiId = process.env.REGISTRATION_FEE_UPI_ID?.trim() || null
  const payeeName = process.env.REGISTRATION_FEE_PAYEE_NAME?.trim() || 'Wellfind Academic'
  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${REGISTRATION_FEE_INR}&cu=INR&tn=${encodeURIComponent('Teacher registration fee')}`
    : null
  return { upiId, payeeName, upiLink, amount: REGISTRATION_FEE_INR, currency: 'INR' }
}

function serializeDocument(value: unknown) {
  if (value && typeof value === 'object') {
    const d = value as Record<string, any>
    return {
      uploaded: true,
      id: d.id ?? null,
      url: d.url ?? null,
      fileName: d.alt || d.filename || 'Document',
      uploadedAt: d.createdAt ?? null,
      mimeType: d.mimeType ?? null,
    }
  }
  return { uploaded: Boolean(value), id: null, url: null, fileName: null, uploadedAt: null, mimeType: null }
}

export async function serializeOwnApplication(payload: Payload, enquiry: Record<string, any>) {
  const status = String(enquiry.applicationStatus || 'new')
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  const feeStatus = String(fee.status || 'pending')

  const history = await (payload as any).find({
    collection: 'enquiry-audit-log',
    where: {
      and: [{ enquiryType: { equals: 'teacher' } }, { teacherEnquiry: { equals: enquiry.id } }],
    },
    sort: 'changedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  return {
    id: enquiry.id,
    fullName: enquiry.fullName,
    email: enquiry.email ?? null,
    mobileNumber: enquiry.mobileNumber,
    primarySubject: enquiry.primarySubject,
    classLevel: enquiry.classLevel,
    teachingLocality: enquiry.teachingLocality,
    highestQualification: enquiry.highestQualification,
    submittedAt: enquiry.createdAt,
    status,
    approved: status === 'approved',
    rejected: status === 'rejected',
    registrationFee: {
      status: feeStatus,
      amount: typeof fee.amount === 'number' ? fee.amount : REGISTRATION_FEE_INR,
      currency: 'INR',
      paymentMethod: fee.paymentMethod ?? null,
      transactionRef: fee.transactionRef ?? null,
      submittedAt: fee.submittedAt ?? null,
      paidAt: feeStatus === 'paid' ? fee.paymentDate ?? null : null,
    },
    payments: await listOwnPayments(payload, enquiry.id),
    registration: registrationState(enquiry),
    payment: {
      online: gatewayInfo(),
      renewal: registrationState(enquiry).canRenew,
      canPay:
        (PAYMENT_STATUSES.includes(status) && (feeStatus === 'pending' || feeStatus === 'submitted')) ||
        registrationState(enquiry).canRenew,
      instructions: paymentInstructions(),
    },
    documents: {
      // Documents are a separate part from the registration payment: they can be added or replaced at any stage.
      canUpload: true,
      aadhaar: serializeDocument(enquiry.aadhaarDocument),
      qualification: serializeDocument(enquiry.qualificationDocument),
    },
    history: (history.docs as Record<string, any>[]).map((h) => ({
      from: h.previousStatus ?? null,
      to: h.newStatus,
      at: h.changedAt,
    })),
    hasProfile: Boolean(extractRelationId(enquiry.teacherProfile)),
  }
}

/** Uploads/replaces the teacher's own KYC documents (Aadhaar and/or qualification certificate). */
export async function uploadOwnDocuments(
  payload: Payload,
  user: AuthUserRecord,
  formData: FormData,
) {
  const enquiry = await findOwnApplication(payload, user)
  const fields = ['aadhaarDocument', 'qualificationDocument'] as const
  const files: { field: (typeof fields)[number]; file: File }[] = []
  for (const field of fields) {
    const value = formData.get(field)
    if (value instanceof File && value.size > 0) files.push({ field, file: value })
  }
  if (files.length === 0) {
    throw new ServiceError('Choose at least one document to upload.', 400, [
      { field: 'aadhaarDocument', message: 'No file received.' },
    ])
  }

  const data: Record<string, unknown> = {}
  const replaced: number[] = []
  for (const { field, file } of files) {
    if (!isAllowedDocumentMimeType(file.type)) {
      throw new ServiceError('Only PDF, JPG and PNG files are allowed.', 400, [
        { field, message: 'Allowed types: PDF, JPG, PNG.' },
      ])
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new ServiceError('Each file must be 5 MB or smaller.', 400, [
        { field, message: 'Maximum size is 5 MB.' },
      ])
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const created = await (payload as any).create({
      collection: 'teacher-documents',
      data: { alt: file.name, owner: user.id },
      file: { data: buffer, name: file.name, mimetype: file.type, size: buffer.length },
    })
    data[field] = created.id
    const old = extractRelationId(enquiry[field])
    if (typeof old === 'number') replaced.push(old)
  }

  await (payload as any).update({
    collection: 'teacher-enquiries',
    id: enquiry.id,
    data,
    overrideAccess: true,
  })
  // Remove superseded files so they do not pile up as orphans.
  for (const id of replaced) {
    await (payload as any)
      .delete({ collection: 'teacher-documents', id, overrideAccess: true })
      .catch(() => undefined)
  }

  const fresh = await (payload as any).findByID({
    collection: 'teacher-enquiries',
    id: enquiry.id,
    depth: 1,
    overrideAccess: true,
  })
  return serializeOwnApplication(payload, fresh)
}

/**
 * Teacher reports that the registration fee has been paid. The fee moves to `submitted`
 * and an administrator verifies it and marks it paid.
 */
export async function submitOwnPayment(
  payload: Payload,
  user: AuthUserRecord,
  body: Record<string, unknown>,
) {
  const enquiry = await findOwnApplication(payload, user)
  const status = String(enquiry.applicationStatus || 'new')
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  const feeStatus = String(fee.status || 'pending')

  if (!PAYMENT_STATUSES.includes(status)) {
    throw new ServiceError('Payment opens once your application is shortlisted.', 409, [
      { field: 'applicationStatus', message: 'Application is not shortlisted yet.' },
    ])
  }
  if (feeStatus === 'paid' || feeStatus === 'waived') {
    throw new ServiceError('The registration fee is already settled.', 409)
  }

  const method = body.method
  if (typeof method !== 'string' || !(teacherPaymentMethods as readonly string[]).includes(method)) {
    throw new ServiceError('Choose a payment method.', 400, [
      { field: 'method', message: `Use one of: ${teacherPaymentMethods.join(', ')}.` },
    ])
  }
  const ref = typeof body.transactionRef === 'string' ? body.transactionRef.trim() : ''
  if (ref.length < 4 || ref.length > 100) {
    throw new ServiceError('Enter the transaction / UTR reference (4-100 characters).', 400, [
      { field: 'transactionRef', message: 'Reference must be 4-100 characters.' },
    ])
  }

  await (payload as any).update({
    collection: 'teacher-enquiries',
    id: enquiry.id,
    data: {
      registrationFee: {
        ...fee,
        status: 'submitted',
        amount: typeof fee.amount === 'number' ? fee.amount : REGISTRATION_FEE_INR,
        paymentMethod: method,
        transactionRef: ref,
        submittedAt: new Date().toISOString(),
      },
    },
    overrideAccess: true,
  })

  const fresh = await (payload as any).findByID({
    collection: 'teacher-enquiries',
    id: enquiry.id,
    depth: 1,
    overrideAccess: true,
  })
  return serializeOwnApplication(payload, fresh)
}
