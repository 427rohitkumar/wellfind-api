import type { Payload } from 'payload'
import * as webpush from 'web-push'
import { MODULES, ROLE_DEFINITIONS, STAFF_ROLES, type Module } from '@/lib/permissions'

/**
 * Self-hosted browser push notifications (Web Push + VAPID). No third-party service.
 * Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env. Without them everything here is a silent no-op.
 * Sending never throws: a failed push must never break the action that caused it.
 */

export interface PushMessage {
  title: string
  body: string
  /** CRM path to open when the notification is clicked, e.g. /admin/student-enquiries/12 */
  url?: string
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string
}

let configured: boolean | null = null

export function pushConfig() {
  return { publicKey: process.env.VAPID_PUBLIC_KEY?.trim() || '', privateKey: process.env.VAPID_PRIVATE_KEY?.trim() || '' }
}

export function isPushConfigured(): boolean {
  if (configured !== null) return configured
  const { publicKey, privateKey } = pushConfig()
  if (!publicKey || !privateKey) return (configured = false)
  const subject = process.env.VAPID_SUBJECT?.trim() || (process.env.SMTP_FROM_EMAIL ? `mailto:${process.env.SMTP_FROM_EMAIL}` : 'mailto:admin@wellfindacademic.com')
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return (configured = true)
}

async function sendToSubscriptions(payload: Payload, subs: Record<string, any>[], message: PushMessage) {
  const body = JSON.stringify({ title: message.title, body: message.body, url: message.url || '/', tag: message.tag })
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 })
      } catch (err: any) {
        // The browser revoked or lost the subscription: forget it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await (payload as any).delete({ collection: 'push-subscriptions', id: s.id, overrideAccess: true }).catch(() => undefined)
        }
      }
    }),
  )
}

/** Push to every browser of the given users. */
export async function pushToUsers(payload: Payload, userIds: (number | string | null | undefined)[], message: PushMessage): Promise<number> {
  try {
    if (!isPushConfigured()) return 0
    const ids = [...new Set(userIds.filter((x): x is number | string => x !== null && x !== undefined && x !== ''))]
    if (ids.length === 0) return 0
    const res = await (payload as any).find({ collection: 'push-subscriptions', where: { user: { in: ids } }, limit: 500, depth: 0, overrideAccess: true })
    await sendToSubscriptions(payload, res.docs, message)
    return res.docs.length
  } catch {
    return 0
  }
}

/** Push to every active staff member whose role can read a module (super admins always included). */
export async function pushToStaff(payload: Payload, module: Module, message: PushMessage): Promise<number> {
  try {
    if (!isPushConfigured()) return 0
    const roles = ['super_admin', ...STAFF_ROLES.filter((r) => ROLE_DEFINITIONS[r].grants[module])]
    const users = await (payload as any).find({ collection: 'users', where: { and: [{ role: { in: roles } }, { status: { equals: 'active' } }] }, limit: 200, depth: 0, overrideAccess: true })
    return pushToUsers(payload, users.docs.map((u: any) => u.id), message)
  } catch {
    return 0
  }
}

/** Fire-and-forget wrapper for hooks: never awaited by the caller, never throws. */
export function pushLater(task: Promise<unknown>) {
  void task.catch(() => undefined)
}

export const PUSH_MODULES = MODULES
