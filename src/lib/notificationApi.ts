import { apiError } from '@/lib/api'
import { parsePositiveIntId } from '@/lib/studentValidation'

export function serializeNotification(n: Record<string, any>) {
  return {
    id: n.id as number,
    type: n.type as string,
    title: n.title as string,
    body: n.body as string,
    entityType: (n.entityType as string | null) ?? null,
    entityId: (n.entityId as string | null) ?? null,
    screen: (n.screen as string | null) ?? null,
    read: Boolean(n.readAt),
    readAt: (n.readAt as string | null) ?? null,
    createdAt: n.createdAt as string,
  }
}

/** Parses a `:id` path segment; returns an error response for anything that is not a positive integer. */
export function parseIdParam(raw: string): { ok: true; id: number } | { ok: false; response: Response } {
  const id = parsePositiveIntId(raw)
  if (!id) return { ok: false, response: apiError('Invalid id.', 400) }
  return { ok: true, id }
}
