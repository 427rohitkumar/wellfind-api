import type { Payload } from 'payload'
import * as webpush from 'web-push'
import { MODULES, type Module } from '@/lib/permissions'
import { notifyUsers, resolveStaffUserIds, type MobileNotification } from '@/services/notificationService'

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
  /** When set, the same event is also saved as an in-app notification and sent to the user's mobile devices (FCM). */
  mobile?: MobileNotification
}

let configured: boolean | null = null

function cleanKey(k: string | undefined): string {
  if (!k) return ''
  return k.trim().replace(/^["']|["']$/g, '')
}

export function pushConfig() {
  let publicKey = cleanKey(process.env.VAPID_PUBLIC_KEY)
  let privateKey = cleanKey(process.env.VAPID_PRIVATE_KEY)

  // Auto-heal if public and private keys were accidentally swapped in environment variables
  // (P-256 public key is 65 bytes / ~87 base64 chars; private key is 32 bytes / ~43 base64 chars)
  if (publicKey.length > 0 && publicKey.length < 50 && privateKey.length > 50) {
    const temp = publicKey
    publicKey = privateKey
    privateKey = temp
  }

  return { publicKey, privateKey }
}

export function isPushConfigured(): boolean {
  if (configured !== null) return configured
  const { publicKey, privateKey } = pushConfig()
  if (!publicKey || !privateKey) return (configured = false)
  const subject = process.env.VAPID_SUBJECT?.trim() || (process.env.SMTP_FROM_EMAIL ? `mailto:${process.env.SMTP_FROM_EMAIL}` : 'mailto:info@wellfindacademic.com')
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    return (configured = true)
  } catch (err) {
    console.error('Failed to configure VAPID webpush:', err)
    return (configured = false)
  }
}

async function sendToSubscriptions(payload: Payload, subs: Record<string, any>[], message: PushMessage) {
  const body = JSON.stringify({ title: message.title, body: message.body, url: message.url || '/', tag: message.tag })
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        )
      } catch (err: any) {
        // The browser revoked or lost the subscription: forget it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await (payload as any).delete({ collection: 'push-subscriptions', id: s.id, overrideAccess: true }).catch(() => undefined)
        }
      }
    }),
  )
}

/** Notify the given users: in-app + mobile (when `mobile` is set) and every browser of theirs in parallel. */
export async function pushToUsers(payload: Payload, userIds: (number | string | null | undefined)[], message: PushMessage): Promise<number> {
  try {
    const ids = [...new Set(userIds.filter((x): x is number | string => x !== null && x !== undefined && x !== ''))]
    if (ids.length === 0) return 0

    const mobileTask = message.mobile
      ? notifyUsers(payload, ids, { ...message.mobile, title: message.title, body: message.body })
      : Promise.resolve(0)

    const webTask = (async () => {
      if (!isPushConfigured()) return 0
      const res = await (payload as any).find({ collection: 'push-subscriptions', where: { user: { in: ids } }, limit: 500, depth: 0, overrideAccess: true })
      await sendToSubscriptions(payload, res.docs, message)
      return res.docs.length
    })()

    const [, webResult] = await Promise.allSettled([mobileTask, webTask])
    return webResult.status === 'fulfilled' ? webResult.value : 0
  } catch {
    return 0
  }
}

/** Notify every active staff member whose role can read a module (super admins always included). */
export async function pushToStaff(payload: Payload, module: Module, message: PushMessage): Promise<number> {
  try {
    return await pushToUsers(payload, await resolveStaffUserIds(payload, module), message)
  } catch {
    return 0
  }
}

/** Fire-and-forget wrapper for hooks: never awaited by the caller, never throws. */
export function pushLater(task: Promise<unknown>) {
  void task.catch(() => undefined)
}

export const PUSH_MODULES = MODULES
