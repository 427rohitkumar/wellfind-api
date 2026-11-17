# Design Document

## Overview

This design describes the minimal targeted changes required to harden the existing status-change audit logging system for Student Enquiries and Teacher Enquiries. The core infrastructure is already in place; this work closes three correctness gaps: a missing `changedAt` timestamp in both `afterChange` hooks, silent error swallowing in the same hooks, and incomplete assertions in the integration test suite.

No new files, no schema migrations, no new dependencies, and no frontend changes are required.

---

## Architecture

The system follows a server-side event-sourcing pattern within Payload CMS's hook pipeline. The architecture has two layers:

```
┌─────────────────────────────────────────────────────────┐
│                   Payload Local API                      │
│  payload.update({ collection: 'student-enquiries' })    │
│  payload.update({ collection: 'teacher-enquiries' })    │
└────────────────────┬────────────────────────────────────┘
                     │ afterChange hook fires
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   AuditHook (per collection)             │
│  1. Skip creates (operation !== 'update')               │
│  2. Compare originalDoc status vs doc status            │
│  3. If changed: payload.create('enquiry-audit-log',     │
│       { ..., changedAt: new Date() },                   │
│       { overrideAccess: true })                         │
│  4. Errors propagate naturally — no try/catch           │
└────────────────────┬────────────────────────────────────┘
                     │ write
                     ▼
┌─────────────────────────────────────────────────────────┐
│              EnquiryAuditLog Collection                  │
│  Append-only. create: false, read: super_admin,         │
│  update: false, delete: false.                          │
└─────────────────────────────────────────────────────────┘
```

### Key design decisions

- **`changedAt: new Date()`** — Added explicitly to the `data` object passed to `payload.create` in both `StudentEnquiries.ts` and `TeacherEnquiries.ts`. The `changedAt` field already exists in the collection schema; only the hook assignment is missing.
- **Error propagation** — Both hooks already use a bare `await req.payload.create(...)` at the top level of the `afterChange` callback with no wrapping `try/catch`. Any rejection from `payload.create` will propagate up through the Payload hook pipeline as an unhandled promise rejection, surfacing to the caller. No explicit `throw` is needed.
- **No architectural changes** — `overrideAccess: true` stays as-is; `changedBy` continues to be read from `req.user?.id`; the create/read/update/delete access control functions on `EnquiryAuditLog` are unchanged.

---

## Components and Interfaces

### 1. `src/collections/StudentEnquiries.ts` — `afterChange` hook

**Current state:** The `payload.create` call is missing `changedAt` in its data object.

**Change:** Add `changedAt: new Date()` to the create data object.

```typescript
await req.payload.create({
  collection: 'enquiry-audit-log',
  data: {
    enquiryType: 'student',
    studentEnquiry: doc.id,
    fieldChanged: 'enquiryStatus',
    previousStatus: previousStatus ?? null,
    newStatus,
    changedBy: req.user?.id ?? null,
    changedAt: new Date(),   // ← ADD THIS LINE
    changeReason: null,
  },
  overrideAccess: true,
})
```

**Error propagation:** No `try/catch` currently wraps this `await` call, so errors already propagate. No change needed on this point.

### 2. `src/collections/TeacherEnquiries.ts` — `afterChange` hook

**Current state:** Same missing `changedAt` gap.

**Change:** Add `changedAt: new Date()` to the create data object.

```typescript
await req.payload.create({
  collection: 'enquiry-audit-log',
  data: {
    enquiryType: 'teacher',
    teacherEnquiry: doc.id,
    fieldChanged: 'applicationStatus',
    previousStatus: previousStatus ?? null,
    newStatus,
    changedBy: req.user?.id ?? null,
    changedAt: new Date(),   // ← ADD THIS LINE
    changeReason: null,
  },
  overrideAccess: true,
})
```

### 3. `tests/int/enquiry-audit-log.int.spec.ts` — Test additions

The existing file has a partial test suite. The following additions are required:

#### 3a. Field assertions for existing student test

After `const audit = audits.docs[0]`, add:

```typescript
expect(audit.enquiryType).toBe('student')
expect(audit.studentEnquiry?.id ?? audit.studentEnquiry).toBe(studentEnquiryId)
expect(audit.fieldChanged).toBe('enquiryStatus')
expect(audit.previousStatus).toBe('new')
expect(audit.newStatus).toBe('contacted')
expect(audit.changedBy).toBeDefined()
expect(audit.changedAt).toBeDefined()
expect(audit.changedAt).not.toBeNull()
```

_(Note: `enquiryType`, `studentEnquiry`, `fieldChanged`, `previousStatus`, and `newStatus` assertions already exist in the file. Only `changedBy` and `changedAt` are missing and must be added.)_

#### 3b. Field assertions for existing teacher test

After the length-check assertion for the teacher audit, add:

```typescript
const audit = audits.docs[0]
expect(audit.enquiryType).toBe('teacher')
expect(audit.teacherEnquiry?.id ?? audit.teacherEnquiry).toBe(teacherEnquiryId)
expect(audit.fieldChanged).toBe('applicationStatus')
expect(audit.previousStatus).toBe('new')
expect(audit.newStatus).toBe('under_review')
expect(audit.changedBy).toBeDefined()
expect(audit.changedAt).toBeDefined()
expect(audit.changedAt).not.toBeNull()
```

#### 3c. New test: public caller cannot create via local API

```typescript
it('should deny create access to non-overrideAccess callers', async ({ skip }) => {
  if (!payload) { skip(); return }
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
```

#### 3d. New test: unauthorized user cannot read via local API

```typescript
it('should deny read access to non-super_admin callers', async ({ skip }) => {
  if (!payload) { skip(); return }
  await expect(
    payload.find({
      collection: 'enquiry-audit-log',
      limit: 1,
      overrideAccess: false,
    })
  ).rejects.toBeDefined()
})
```

#### 3e. New test: error propagation

```typescript
it('should propagate errors from the audit log create call', async ({ skip }) => {
  if (!payload) { skip(); return }

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
```

#### 3f. New test: end-to-end REST PATCH creates audit entry

```typescript
it('end-to-end: REST PATCH on a student enquiry creates an audit entry', async ({ skip }) => {
  if (!payload || !adminToken) { skip(); return }

  const restPatch = REST_PATCH(config)

  // Create a student enquiry
  const created = await payload.create({
    collection: 'student-enquiries',
    data: {
      studentClass: 'Class 8',
      subjects: [{ subject: 'History' }],
      preferredTiming: 'Afternoon',
      locality: 'East End',
      budgetRange: 'GBP 25-40',
      name: 'REST Patch Tester',
      phoneNumber: '+44 7700 900777',
      agreedToPolicy: true,
    },
  })

  const countBefore = await payload.count({
    collection: 'enquiry-audit-log',
    where: { studentEnquiry: { equals: created.id } },
  })

  // Fire a PATCH via the Payload REST route handler with super_admin auth
  const res = await restPatch(
    {
      url: `http://localhost:3000/api/student-enquiries/${created.id}`,
      method: 'PATCH',
      headers: new Headers({
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      }),
      json: async () => ({ enquiryStatus: 'in_progress' }),
      text: async () => JSON.stringify({ enquiryStatus: 'in_progress' }),
    } as unknown as Request,
    {
      params: Promise.resolve({ slug: ['student-enquiries', String(created.id)] } as { slug?: string[] | undefined }),
    },
  )

  expect(res.status).toBe(200)

  const countAfter = await payload.count({
    collection: 'enquiry-audit-log',
    where: { studentEnquiry: { equals: created.id } },
  })
  expect(countAfter).toBe(countBefore + 1)

  // Cleanup
  await payload.delete({ collection: 'student-enquiries', id: created.id, overrideAccess: true }).catch(() => {})
  const auditEntries = await payload.find({
    collection: 'enquiry-audit-log',
    where: { studentEnquiry: { equals: created.id } },
    overrideAccess: true,
  })
  for (const e of auditEntries.docs) {
    await payload.delete({ collection: 'enquiry-audit-log', id: e.id, overrideAccess: true }).catch(() => {})
  }
})
```

---

## Testing Strategy

The test strategy uses a dual-layer approach combining example-based integration tests with property-style assertions.

**Integration tests** (`tests/int/enquiry-audit-log.int.spec.ts`) run against a live PostgreSQL instance via the Payload local API. They exercise the full hook pipeline — create, update, audit write — and verify the resulting database state directly. These tests are skipped if the database is unavailable.

**Property coverage:** Every correctness property defined in this document maps to one or more integration test assertions. Properties 1 and 2 (field completeness) are validated by field-by-field assertions in the student and teacher status-change tests. Property 3 (idempotence) is validated by the same-status and no-create tests. Property 4 (`changedAt`) is validated by the explicit `expect(audit.changedAt).toBeDefined()` and `not.toBeNull()` assertions added to both tests. Properties 5 and 6 (access control) are validated by dedicated `overrideAccess: false` rejection tests. Property 7 (error propagation) is validated by the `payload.create` stub test.

**Unit tests:** The existing `canReadEnquiryAuditLog` unit test validates the access-control helper in isolation without requiring a database.

**End-to-end HTTP coverage:** The REST PATCH test exercises the full HTTP path through Payload's route handler to confirm audit entries are created via the REST surface, not just the local API.

No property-based testing (randomized input generation) is appropriate here. The behavior under test is infrastructure wiring and server-side access control — patterns where 2–3 specific examples find the same bugs as 100 randomized ones. The hook logic is deterministic: it either fires or does not based on `operation` and a simple equality check.

## Data Models

No schema changes. The `EnquiryAuditLog` collection schema already defines all required fields including `changedAt` (type: `date`, index: true). The only gap is that the AuditHooks were not populating this field at write time.

### Audit entry shape (at hook write time)

| Field             | Source                          | Type              |
|-------------------|---------------------------------|-------------------|
| `enquiryType`     | Hardcoded in hook               | `'student' \| 'teacher'` |
| `studentEnquiry`  | `doc.id` (student hooks only)   | relationship id   |
| `teacherEnquiry`  | `doc.id` (teacher hooks only)   | relationship id   |
| `fieldChanged`    | Hardcoded in hook               | `'enquiryStatus' \| 'applicationStatus'` |
| `previousStatus`  | `originalDoc?.enquiryStatus` / `originalDoc?.applicationStatus` | text |
| `newStatus`       | `doc.enquiryStatus` / `doc.applicationStatus` | text |
| `changedBy`       | `req.user?.id ?? null`          | relationship id   |
| `changedAt`       | `new Date()` ← **fix**          | date              |
| `changeReason`    | `null` (Phase 1 — not required) | textarea          |

No new TypeScript interfaces. The existing Payload-generated `EnquiryAuditLog` type in `payload-types.ts` already covers all fields. The `canReadEnquiryAuditLog` helper exported from `EnquiryAuditLog.ts` remains unchanged.

---

## Error Handling

### Hook error propagation

Both `afterChange` hooks use a bare `await` at the top level of the async callback:

```typescript
afterChange: [
  async ({ operation, originalDoc, doc, req }: any) => {
    if (operation === 'create' || operation !== 'update') return
    if (previousStatus === newStatus) return
    // No try/catch here — rejection propagates naturally
    await req.payload.create({ ... })
  }
]
```

When `req.payload.create` rejects, the async function rejects, Payload's hook runner receives the rejection, and it surfaces to the original caller (REST response becomes a 500, local API call rejects). This is the correct behavior: a failed audit write must not silently succeed.

### Test error-propagation strategy

The test mocks `payload.create` at the instance level for the duration of a single test (pattern: save original, replace, assert, restore in `finally`). This avoids module-level mocking (no `vi.mock` needed) and keeps the test self-contained.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Audit entry field completeness

*For any* Student_Enquiry status transition (previous ≠ new), the created Audit_Log entry SHALL have `enquiryType === 'student'`, `studentEnquiry` pointing to the updated enquiry's id, `fieldChanged === 'enquiryStatus'`, `previousStatus` matching the value in `originalDoc`, `newStatus` matching the value written to `doc`, `changedBy` non-null, and `changedAt` non-null.

**Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1**

### Property 2: Teacher audit entry field completeness

*For any* Teacher_Enquiry application status transition (previous ≠ new), the created Audit_Log entry SHALL have `enquiryType === 'teacher'`, `teacherEnquiry` pointing to the updated enquiry's id, `fieldChanged === 'applicationStatus'`, `previousStatus` matching `originalDoc.applicationStatus`, `newStatus` matching the persisted value, `changedBy` non-null, and `changedAt` non-null.

**Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.2**

### Property 3: No spurious audit entries on same-value update

*For any* Student_Enquiry or Teacher_Enquiry update where the status field value is identical to the value in `originalDoc`, the AuditHook SHALL create zero new Audit_Log entries. The audit count for that enquiry SHALL be identical before and after the update.

**Validates: Requirements 2.3, 2.4**

### Property 4: changedAt is always a defined, non-null date

*For any* Audit_Log entry created by the AuditHook, the `changedAt` field SHALL be a defined, non-null value that is parseable as a Date.

**Validates: Requirements 1.8, 2.9**

### Property 5: Access control — create denied without overrideAccess

*For any* caller that attempts to create an Audit_Log entry via the Payload local API with `overrideAccess: false`, the operation SHALL be rejected (throw an error or return an access-denied response).

**Validates: Requirements 4.1**

### Property 6: Access control — read denied without super_admin role

*For any* caller without `role === 'super_admin'` that attempts to read the Audit_Log via the Payload local API with `overrideAccess: false`, the operation SHALL be denied (no records returned or access error thrown).

**Validates: Requirements 4.3, 4.7**

### Property 7: Error propagation invariant

*For any* AuditHook execution where `req.payload.create` throws an error, the error SHALL propagate out of the `afterChange` hook rather than being caught or suppressed. The status-change operation SHALL not be reported as successful to the caller.

**Validates: Requirements 3.1, 3.2, 3.3**
