/**
 * Mail configuration, read from the environment on every call so that changing
 * `.env` (and restarting) is all that is needed. Nothing here is hard coded
 * except safe fallbacks.
 */
export interface MailConfig {
  configured: boolean
  dryRun: boolean
  host: string | null
  port: number | null
  secure: boolean
  user: string | null
  password: string | null
  fromEmail: string
  fromName: string
  replyTo: string | null
  brandName: string
  supportEmail: string | null
  teacherPortalUrl: string
  adminPortalUrl: string
  registrationFeeAmount: number
  registrationValidityDays: number
  /** Reminder lead times (days before expiry) used by the expiry job. */
  expiryReminderDays: number[]
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getMailConfig(): MailConfig {
  const env = process.env
  const host = env.SMTP_HOST?.trim() || null
  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : null
  const user = env.SMTP_USER?.trim() || null
  const password = env.SMTP_PASSWORD || null
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465
  const isPlaceholder = (v: string | null) => !v || /^YOUR_/i.test(v)

  const portalBase = (env.APP_PORTAL_URL || 'http://localhost:5173').replace(/\/+$/, '')
  return {
    configured: !isPlaceholder(host) && Boolean(port) && !isPlaceholder(user) && !isPlaceholder(password),
    dryRun: env.MAIL_DRY_RUN === 'true',
    host,
    port,
    secure,
    user,
    password,
    fromEmail: env.SMTP_FROM_EMAIL?.trim() || user || 'noreply@example.com',
    fromName: env.SMTP_FROM_NAME?.trim() || 'Wellfind Academic',
    replyTo: env.MAIL_REPLY_TO?.trim() || null,
    brandName: env.MAIL_BRAND_NAME?.trim() || env.SMTP_FROM_NAME?.trim() || 'Wellfind Academic',
    supportEmail: env.MAIL_SUPPORT_EMAIL?.trim() || env.SMTP_FROM_EMAIL?.trim() || null,
    teacherPortalUrl: (env.TEACHER_PORTAL_URL || env.TEACHER_LOGIN_URL || `${portalBase}/teacher`).replace(/\/+$/, ''),
    adminPortalUrl: (env.ADMIN_PORTAL_URL || `${portalBase}/admin`).replace(/\/+$/, ''),
    registrationFeeAmount: num(env.REGISTRATION_FEE_AMOUNT, 1000),
    registrationValidityDays: num(env.REGISTRATION_VALIDITY_DAYS, 365),
    expiryReminderDays: (env.REGISTRATION_EXPIRY_REMINDER_DAYS || '30,7')
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isFinite(d) && d > 0)
      .sort((a, b) => b - a),
  }
}

/** Safe-to-display view of the configuration (never includes the password). */
export function publicMailConfig(cfg: MailConfig = getMailConfig()) {
  return {
    configured: cfg.configured,
    dryRun: cfg.dryRun,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user ? cfg.user.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    replyTo: cfg.replyTo,
    teacherPortalUrl: cfg.teacherPortalUrl,
    registrationFeeAmount: cfg.registrationFeeAmount,
    registrationValidityDays: cfg.registrationValidityDays,
    expiryReminderDays: cfg.expiryReminderDays,
    testMode: Boolean(process.env.VITEST),
  }
}
