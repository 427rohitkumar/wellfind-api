import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { ANDROID_CHANNEL_ID } from '@/lib/notificationConfig'

/**
 * Firebase Admin (FCM HTTP v1), server side only.
 * Credentials come from the environment and are never logged or returned by any API:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (keep the \n line breaks)
 * Without them mobile push is a silent no-op; in-app notifications are still saved.
 */

export interface FcmMessage {
  token: string
  title: string
  body: string
  /** String values only (FCM requirement). Never put sensitive data here. */
  data: Record<string, string>
}

export type FcmResult =
  | { ok: true; messageId: string }
  | { ok: false; code: string; invalidToken: boolean; transient: boolean }

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
  'messaging/mismatched-credential',
])
const TRANSIENT_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/message-rate-exceeded',
  'messaging/device-message-rate-exceeded',
  'messaging/topics-message-rate-exceeded',
  'app/network-error',
  'app/network-timeout',
])

function readCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

export function isFcmConfigured(): boolean {
  return readCredentials() !== null
}

let app: App | null = null

function getApp(): App | null {
  if (app) return app
  const credentials = readCredentials()
  if (!credentials) return null
  try {
    app = getApps().find((a) => a.name === 'wellfind-fcm') ?? initializeApp({ credential: cert(credentials) }, 'wellfind-fcm')
    return app
  } catch {
    // Never print the error: it can echo parts of the credentials.
    console.error('Firebase Admin failed to initialise. Check the FIREBASE_* environment variables.')
    return null
  }
}

/** Sends one message to one device token. Never throws; never exposes credentials. */
export async function sendFcmMessage(message: FcmMessage): Promise<FcmResult> {
  const firebase = getApp()
  if (!firebase) return { ok: false, code: 'fcm/not-configured', invalidToken: false, transient: false }
  try {
    const messageId = await getMessaging(firebase).send({
      token: message.token,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: {
        priority: 'high',
        notification: { channelId: ANDROID_CHANNEL_ID, sound: 'default' },
      },
    })
    return { ok: true, messageId }
  } catch (err: unknown) {
    const code = typeof (err as { code?: unknown })?.code === 'string' ? ((err as { code: string }).code) : 'fcm/unknown'
    return { ok: false, code, invalidToken: INVALID_TOKEN_CODES.has(code), transient: TRANSIENT_CODES.has(code) }
  }
}
