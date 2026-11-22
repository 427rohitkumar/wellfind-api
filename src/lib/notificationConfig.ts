/**
 * Which deployment this backend is. Device tokens are stored with an environment and a backend
 * only ever notifies devices of its own environment, so a development/preview backend can never
 * reach production phones (and the other way round).
 *
 * Set NOTIFICATION_ENV (or APP_ENV) to development | preview | production.
 * Default: production when NODE_ENV=production, otherwise development.
 */
export const NOTIFICATION_ENVIRONMENTS = ['development', 'preview', 'production'] as const
export type NotificationEnvironment = (typeof NOTIFICATION_ENVIRONMENTS)[number]

export function isNotificationEnvironment(value: unknown): value is NotificationEnvironment {
  return typeof value === 'string' && (NOTIFICATION_ENVIRONMENTS as readonly string[]).includes(value)
}

export function getNotificationEnvironment(): NotificationEnvironment {
  const raw = (process.env.NOTIFICATION_ENV || process.env.APP_ENV || '').trim().toLowerCase()
  if (isNotificationEnvironment(raw)) return raw
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

/** Android notification channel used for every push (the app creates it with this id). */
export const ANDROID_CHANNEL_ID = 'wellfind-default'
