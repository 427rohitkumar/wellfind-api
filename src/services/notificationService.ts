import type { Payload } from 'payload'
import { sendFcmMessage, isFcmConfigured } from '@/lib/firebaseAdmin'
import { getNotificationEnvironment } from '@/lib/notificationConfig'
import { ROLE_DEFINITIONS, STAFF_ROLES, type Module } from '@/lib/permissions'

/**
 * Shared notification core used by the CRM events (pushEvents.ts):
 *   1. save the in-app notification (the source of truth, never rolled back),
 *   2. try FCM delivery to the recipient's active devices of THIS backend's environment.
 * Nothing here throws: a failing notification must never break the business operation.
 */

export interface MobileNotification {
  /** e.g. student_inquiry_created, payment_received */
  type: string
  entityType?: string
  entityId?: number | string
  /** App route to open when the notification is tapped (validated again inside the app). */
  screen?: string
  /** Same key = same business event: a user is notified once per key. */
  dedupeKey?: string
}

export interface NotificationContent extends MobileNotification {
  title: string
  body: string
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 400
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string }
  return e?.code === '23505' || e?.cause?.code === '23505' || /unique|duplicate|dedupeKey/i.test(e?.message ?? '')
}

/** Saves the notification; returns null when it already exists (duplicate) or could not be saved. */
async function persist(payload: Payload, userId: number | string, n: NotificationContent): Promise<Record<string, any> | null> {
  const dedupeKey = n.dedupeKey ? `${userId}:${n.dedupeKey}`.slice(0, 200) : undefined
  try {
    if (dedupeKey) {
      const existing = await (payload as any).find({ collection: 'notifications', where: { dedupeKey: { equals: dedupeKey } }, limit: 1, depth: 0, overrideAccess: true })
      if (existing.docs[0]) return null
    }
    return (await (payload as any).create({
      collection: 'notifications',
      data: {
        user: userId,
        type: n.type,
        title: n.title.slice(0, 160),
        body: n.body.slice(0, 500),
        entityType: n.entityType,
        entityId: n.entityId !== undefined ? String(n.entityId) : undefined,
        screen: n.screen,
        ...(dedupeKey ? { dedupeKey } : {}),
      },
      overrideAccess: true,
    })) as Record<string, any>
  } catch (err) {
    if (!isUniqueViolation(err)) console.error('Could not save a notification.')
    return null
  }
}

async function logDelivery(payload: Payload, data: Record<string, unknown>) {
  await (payload as any).create({ collection: 'notification-deliveries', data, overrideAccess: true }).catch(() => undefined)
}

/** Sends one notification to every active device of its user, in this backend's environment only. */
export async function deliverNotification(payload: Payload, notification: Record<string, any>): Promise<number> {
  if (!isFcmConfigured()) return 0
  const userId = typeof notification.user === 'object' && notification.user ? notification.user.id : notification.user
  const devices = await (payload as any).find({
    collection: 'user-devices',
    where: { and: [{ user: { equals: userId } }, { active: { equals: true } }, { environment: { equals: getNotificationEnvironment() } }] },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  let delivered = 0
  await Promise.all(
    (devices.docs as Record<string, any>[]).map(async (device) => {
      const message = {
        token: device.fcmToken as string,
        title: notification.title as string,
        body: notification.body as string,
        data: {
          notificationId: String(notification.id),
          type: String(notification.type),
          entityType: String(notification.entityType ?? ''),
          entityId: String(notification.entityId ?? ''),
          screen: String(notification.screen ?? ''),
        },
      }
      let attempts = 0
      let result = await sendFcmMessage(message)
      attempts++
      while (!result.ok && result.transient && attempts < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * 2 ** (attempts - 1))
        result = await sendFcmMessage(message)
        attempts++
      }
      if (result.ok) {
        delivered++
        await logDelivery(payload, { notification: notification.id, device: device.id, status: 'sent', attempts, messageId: result.messageId })
        return
      }
      await logDelivery(payload, { notification: notification.id, device: device.id, status: result.invalidToken ? 'invalid_token' : 'failed', attempts, errorCode: result.code })
      if (result.invalidToken) {
        // The token is dead (app uninstalled / token rotated): stop using it.
        await (payload as any).update({ collection: 'user-devices', id: device.id, data: { active: false }, overrideAccess: true }).catch(() => undefined)
      }
    }),
  )
  return delivered
}

/** Saves an in-app notification for each user, then pushes it. Returns how many users got a new notification. */
export async function notifyUsers(payload: Payload, userIds: (number | string | null | undefined)[], content: NotificationContent): Promise<number> {
  try {
    const ids = [...new Set(userIds.filter((x): x is number | string => x !== null && x !== undefined && x !== ''))]
    let created = 0
    for (const id of ids) {
      const saved = await persist(payload, id, content)
      if (!saved) continue
      created++
      // FCM trouble stays in the delivery log; the saved notification remains.
      await deliverNotification(payload, saved).catch(() => undefined)
    }
    return created
  } catch {
    return 0
  }
}

/** Ids of the active staff whose role can read a module (super admins always included). */
export async function resolveStaffUserIds(payload: Payload, module: Module): Promise<(number | string)[]> {
  const roles = ['super_admin', ...STAFF_ROLES.filter((r) => ROLE_DEFINITIONS[r].grants[module])]
  const users = await (payload as any).find({ collection: 'users', where: { and: [{ role: { in: roles } }, { status: { equals: 'active' } }] }, limit: 200, depth: 0, overrideAccess: true })
  return users.docs.map((u: any) => u.id)
}

export async function notifyStaff(payload: Payload, module: Module, content: NotificationContent): Promise<number> {
  try {
    return await notifyUsers(payload, await resolveStaffUserIds(payload, module), content)
  } catch {
    return 0
  }
}
