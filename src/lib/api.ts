import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { isBlockedOrSuspended } from '@/lib/auth'
import { canAccessRequest } from '@/lib/permissions'
import { parsePositiveIntId } from '@/lib/studentValidation'

export interface ApiFieldError {
  field?: string
  message: string
}

/**
 * Standard PRD Section 10 success envelope for new/extended custom endpoints.
 */
export function apiSuccess<T>(data: T, message: string, status = 200): Response {
  return Response.json(
    {
      success: true,
      message,
      data,
    },
    { status },
  )
}

/**
 * Standard PRD Section 10 error envelope for new/extended custom endpoints.
 */
export function apiError(message: string, status = 400, errors?: ApiFieldError[]): Response {
  const payload: {
    success: false
    message: string
    errors?: ApiFieldError[]
  } = {
    success: false,
    message,
  }
  if (errors && errors.length > 0) {
    payload.errors = errors
  }
  return Response.json(payload, { status })
}

export interface AuthUserRecord {
  id: number
  email?: string
  role?: string | null
  status?: string | null
}

export type AuthenticatedAuthResult =
  { ok: true; payload: Payload; user: AuthUserRecord } | { ok: false; response: Response }

export type SuperAdminAuthResult = AuthenticatedAuthResult

/**
 * Authenticates the request via Payload and rejects blocked/suspended accounts.
 * Returns `401` when unauthenticated and `403` when account is blocked/suspended.
 */
export async function requireActiveUser(request: Request): Promise<AuthenticatedAuthResult> {
  const payload = await getPayload({ config })
  const authResult = await (payload as any).auth({
    req: request as unknown as { headers: Headers },
    headers: request.headers,
  })

  const user = (authResult?.user ?? null) as AuthUserRecord | null
  if (!user) {
    return {
      ok: false,
      response: apiError('Authentication required.', 401),
    }
  }

  if (isBlockedOrSuspended(user.status)) {
    return {
      ok: false,
      response: apiError('Account is blocked or suspended.', 403),
    }
  }

  return { ok: true, payload, user }
}

/**
 * Authenticates the request via Payload and enforces active `super_admin` access.
 * Returns `401` when unauthenticated and `403` when authenticated without active
 * `super_admin` privileges.
 */
export async function requireSuperAdmin(request: Request): Promise<SuperAdminAuthResult> {
  const active = await requireActiveUser(request)
  if (!active.ok) {
    return active
  }

  if (!canAccessRequest(active.user, request)) {
    return {
      ok: false,
      response: apiError('You do not have access to this area.', 403),
    }
  }

  return active
}

/**
 * Reads and parses a JSON request body. When `allowEmpty` is true and no body
 * bytes are present, returns an empty object `{}`.
 */
export async function parseJsonObject(
  request: Request,
  options: { allowEmpty?: boolean } = {},
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: Response }> {
  let rawText = ''
  try {
    rawText = await request.text()
  } catch {
    return {
      ok: false,
      response: apiError('Invalid request body.', 400),
    }
  }

  if (rawText.trim().length === 0) {
    if (options.allowEmpty) {
      return { ok: true, data: {} }
    }
    return {
      ok: false,
      response: apiError('Request body must be valid JSON.', 400),
    }
  }

  try {
    const parsed = JSON.parse(rawText) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        response: apiError('Request body must be a JSON object.', 400),
      }
    }
    return { ok: true, data: parsed as Record<string, unknown> }
  } catch {
    return {
      ok: false,
      response: apiError('Invalid request body.', 400),
    }
  }
}

interface RawErrorEntry {
  field?: unknown
  path?: unknown
  message?: unknown
}

function getRawValidationEntries(err: unknown): RawErrorEntry[] {
  if (!err || typeof err !== 'object') {
    return []
  }
  const candidate = err as {
    errors?: unknown
    data?: { errors?: unknown }
  }
  if (Array.isArray(candidate.errors)) {
    return candidate.errors as RawErrorEntry[]
  }
  if (Array.isArray(candidate.data?.errors)) {
    return candidate.data.errors as RawErrorEntry[]
  }
  return []
}

/**
 * Returns true if the error originates from a PostgreSQL unique constraint
 * violation (`23505`) or Payload unique validation failure.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const candidate = err as {
    code?: unknown
    cause?: { code?: unknown; message?: unknown }
    message?: unknown
  }
  if (candidate.code === '23505' || candidate.cause?.code === '23505') {
    return true
  }
  const rawErrors = getRawValidationEntries(err)
  if (
    rawErrors.some(
      (e) => typeof e?.message === 'string' && e.message.toLowerCase().includes('unique'),
    )
  ) {
    return true
  }
  const msg = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''
  const causeMsg =
    typeof candidate.cause?.message === 'string' ? candidate.cause.message.toLowerCase() : ''
  return (
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    causeMsg.includes('duplicate key') ||
    causeMsg.includes('unique constraint')
  )
}

/**
 * Extracts structured Payload validation errors if present.
 */
export function extractValidationErrors(err: unknown): ApiFieldError[] | null {
  const rawErrors = getRawValidationEntries(err)
  if (rawErrors.length === 0) {
    return null
  }
  return rawErrors.map((e) => ({
    field: typeof e.field === 'string' ? e.field : typeof e.path === 'string' ? e.path : undefined,
    message: typeof e.message === 'string' ? e.message : 'Invalid value.',
  }))
}

/**
 * Uniformly maps thrown ServiceError, Payload validation errors, or unexpected
 * exceptions to PRD Section 10 error responses.
 */
export function handleRouteError(err: unknown, fallbackMessage: string): Response {
  const validationErrors = extractValidationErrors(err)
  if (err && typeof err === 'object' && 'status' in err) {
    const serviceErr = err as {
      status?: unknown
      message?: unknown
      errors?: ApiFieldError[]
    }
    if (
      typeof serviceErr.status === 'number' &&
      serviceErr.status >= 400 &&
      serviceErr.status < 600
    ) {
      return apiError(
        typeof serviceErr.message === 'string' ? serviceErr.message : fallbackMessage,
        serviceErr.status,
        serviceErr.errors ?? validationErrors ?? undefined,
      )
    }
  }

  if (validationErrors) {
    return apiError(
      err instanceof Error ? err.message : 'Validation failed.',
      400,
      validationErrors,
    )
  }

  return apiError(err instanceof Error ? err.message : fallbackMessage, 500)
}

/**
 * Authenticates the request (`super_admin` by default, or any active user when
 * `requireAdmin: false`) and validates a positive integer route `[id]` param.
 */
export async function authorizeRouteWithId(
  request: Request,
  context: { params: Promise<{ id: string }> },
  options: {
    field: string
    label: string
    requireAdmin?: boolean
  },
): Promise<
  | { ok: true; payload: Payload; user: AuthUserRecord; entityId: number }
  | { ok: false; response: Response }
> {
  const auth =
    options.requireAdmin === false
      ? await requireActiveUser(request)
      : await requireSuperAdmin(request)

  if (!auth.ok) {
    return auth
  }

  const { id } = await context.params
  const entityId = parsePositiveIntId(id)
  if (!entityId) {
    return {
      ok: false,
      response: apiError(`Invalid ${options.label} ID.`, 400, [
        { field: options.field, message: 'ID must be a positive integer.' },
      ]),
    }
  }

  return {
    ok: true,
    payload: auth.payload,
    user: auth.user,
    entityId,
  }
}
