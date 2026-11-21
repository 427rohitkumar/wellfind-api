import nodemailer from 'nodemailer'
import type { Payload } from 'payload'
import { getMailConfig, publicMailConfig, type MailConfig } from '@/lib/mail/config'
import { listTemplates, renderTemplate, templates } from '@/lib/mail/templates'
import { isValidEmail } from '@/lib/studentValidation'

export interface SendMailParams {
  template: string
  to: string
  toName?: string | null
  data?: Record<string, any>
  relatedType?: string
  relatedId?: string | number
  /** When set, a mail with the same key that was already sent/queued is not sent again. */
  dedupeKey?: string
  payload?: Payload
}

export interface SendMailResult {
  ok: boolean
  status: 'sent' | 'failed' | 'skipped' | 'duplicate' | 'invalid'
  logId?: number | string
  error?: string
}

let cached: { signature: string; transport: nodemailer.Transporter } | null = null

function getTransport(cfg: MailConfig): nodemailer.Transporter | null {
  if (!cfg.configured || !cfg.host || !cfg.port) return null
  const signature = [cfg.host, cfg.port, cfg.secure, cfg.user, cfg.password].join('|')
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      transport: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user!, pass: cfg.password! },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    }
  }
  return cached.transport
}

/** The Payload instance. Loaded lazily to avoid an import cycle with payload.config. */
async function resolvePayload(given?: Payload): Promise<Payload> {
  if (given) return given
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@/payload.config')])
  return getPayload({ config })
}

const clip = (s: string, n = 1800) => (s.length > n ? `${s.slice(0, n)}…` : s)

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/Invalid login|535|authentication/i.test(raw)) return `SMTP login was rejected. Check SMTP_USER and SMTP_PASSWORD. (${raw})`
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return `SMTP host could not be found. Check SMTP_HOST. (${raw})`
  if (/ECONNREFUSED|ETIMEDOUT|ESOCKET|timeout/i.test(raw)) return `Could not reach the SMTP server. Check SMTP_HOST / SMTP_PORT and your network. (${raw})`
  return raw
}

function stripSecrets(template: string, data: Record<string, any>): Record<string, any> {
  const keys = templates[template]?.sensitiveKeys ?? []
  const copy = { ...data }
  for (const k of keys) delete copy[k]
  return copy
}

/** Deliver one rendered mail. Returns the outcome without throwing. */
async function deliver(
  cfg: MailConfig,
  to: string,
  toName: string | null | undefined,
  rendered: { subject: string; html: string; text: string },
): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string; messageId?: string }> {
  if (process.env.VITEST) return { status: 'skipped', error: 'Mail is disabled in the test environment.' }
  if (cfg.dryRun) return { status: 'skipped', error: 'Dry run: MAIL_DRY_RUN=true, nothing was sent.' }
  const transport = getTransport(cfg)
  if (!transport) {
    return { status: 'skipped', error: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD in .env.' }
  }
  try {
    const info = await transport.sendMail({
      from: { name: cfg.fromName, address: cfg.fromEmail },
      to: toName ? { name: toName, address: to } : to,
      ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
    const rejected = Array.isArray(info.rejected) ? info.rejected : []
    if (rejected.length > 0) return { status: 'failed', error: `The server rejected the recipient: ${rejected.join(', ')}` }
    return { status: 'sent', messageId: info.messageId }
  } catch (err) {
    return { status: 'failed', error: clip(friendlyError(err)) }
  }
}

/**
 * Renders a template, records it in `email-logs` and sends it. Never throws, so a mail
 * problem can never break the action that triggered it.
 */
export async function sendTemplatedEmail(params: SendMailParams): Promise<SendMailResult> {
  try {
    const to = params.to?.trim().toLowerCase()
    if (!isValidEmail(to)) return { ok: false, status: 'invalid', error: 'Recipient email address is invalid.' }

    const payload = await resolvePayload(params.payload)
    const cfg = getMailConfig()
    const data = params.data ?? {}
    const tpl = templates[params.template]
    if (!tpl) return { ok: false, status: 'failed', error: `Unknown mail template "${params.template}".` }

    if (params.dedupeKey) {
      const dup = await (payload as any).find({
        collection: 'email-logs',
        where: { and: [{ dedupeKey: { equals: params.dedupeKey } }, { status: { in: ['sent', 'queued'] } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (dup.docs.length > 0) return { ok: true, status: 'duplicate', logId: dup.docs[0].id }
    }

    let rendered
    try {
      rendered = renderTemplate(params.template, data, cfg)
    } catch (err) {
      return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) }
    }

    const log = await (payload as any).create({
      collection: 'email-logs',
      data: {
        recipient: to,
        recipientName: params.toName ?? undefined,
        template: params.template,
        subject: rendered.subject.slice(0, 300),
        status: 'queued',
        attempts: 0,
        relatedType: params.relatedType,
        relatedId: params.relatedId != null ? String(params.relatedId) : undefined,
        dedupeKey: params.dedupeKey,
        retryable: !tpl.sensitiveKeys?.length,
        templateData: stripSecrets(params.template, data),
      },
      overrideAccess: true,
    })

    const outcome = await deliver(cfg, to, params.toName, rendered)
    await (payload as any).update({
      collection: 'email-logs',
      id: log.id,
      data: {
        status: outcome.status,
        attempts: 1,
        error: outcome.error ?? null,
        messageId: outcome.messageId ?? null,
        sentAt: outcome.status === 'sent' ? new Date().toISOString() : null,
        // A dry-run/skipped mail with secrets can never be re-rendered later.
      },
      overrideAccess: true,
    })
    return { ok: outcome.status === 'sent', status: outcome.status, logId: log.id, error: outcome.error }
  } catch (err) {
    return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Re-sends a failed or skipped mail from its stored (secret-free) data. */
export async function retryEmail(payload: Payload, id: number | string): Promise<SendMailResult> {
  const log = await (payload as any).findByID({ collection: 'email-logs', id, depth: 0, disableErrors: true, overrideAccess: true })
  if (!log) return { ok: false, status: 'failed', error: 'Email log not found.' }
  if (log.status === 'sent') return { ok: false, status: 'failed', error: 'This email was already sent.' }
  if (!log.retryable) {
    return { ok: false, status: 'failed', error: 'This email contained credentials that are not stored. Trigger it again (for example reset the password).' }
  }
  const cfg = getMailConfig()
  let rendered
  try {
    rendered = renderTemplate(log.template, log.templateData ?? {}, cfg)
  } catch (err) {
    return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
  const outcome = await deliver(cfg, log.recipient, log.recipientName, rendered)
  await (payload as any).update({
    collection: 'email-logs',
    id,
    data: {
      status: outcome.status,
      attempts: Number(log.attempts || 0) + 1,
      error: outcome.error ?? null,
      messageId: outcome.messageId ?? null,
      sentAt: outcome.status === 'sent' ? new Date().toISOString() : log.sentAt ?? null,
    },
    overrideAccess: true,
  })
  return { ok: outcome.status === 'sent', status: outcome.status, logId: id, error: outcome.error }
}

/** Checks the SMTP connection and login without sending anything. */
export async function verifyMailConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = getMailConfig()
  if (process.env.VITEST) return { ok: false, message: 'Mail is disabled in the test environment.' }
  if (!cfg.configured) return { ok: false, message: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD in .env.' }
  const transport = getTransport(cfg)!
  try {
    await transport.verify()
    return { ok: true, message: `Connected to ${cfg.host}:${cfg.port} and logged in as ${publicMailConfig(cfg).user}.` }
  } catch (err) {
    return { ok: false, message: clip(friendlyError(err)) }
  }
}

/** Counts for the admin Mail tab. */
export async function getMailStats(payload: Payload) {
  const count = async (where: Record<string, any>) =>
    ((await (payload as any).count({ collection: 'email-logs', where, overrideAccess: true })) as { totalDocs: number }).totalDocs
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const day = 86_400_000

  const [total, sent, failed, skipped, queued, last24h, last7d, failed7d] = await Promise.all([
    count({}),
    count({ status: { equals: 'sent' } }),
    count({ status: { equals: 'failed' } }),
    count({ status: { equals: 'skipped' } }),
    count({ status: { equals: 'queued' } }),
    count({ createdAt: { greater_than: since(day) } }),
    count({ createdAt: { greater_than: since(7 * day) } }),
    count({ and: [{ status: { equals: 'failed' } }, { createdAt: { greater_than: since(7 * day) } }] }),
  ])

  const byTemplate = await Promise.all(
    listTemplates().map(async (t) => ({
      key: t.key,
      label: t.label,
      total: await count({ template: { equals: t.key } }),
      failed: await count({ and: [{ template: { equals: t.key } }, { status: { equals: 'failed' } }] }),
    })),
  )

  return {
    config: publicMailConfig(),
    totals: { total, sent, failed, skipped, queued, last24h, last7d, failed7d },
    templates: byTemplate,
  }
}

export interface TestMailParams {
  payload: Payload
  to: string
  sentBy?: string
}

export async function sendTestEmail({ payload, to, sentBy }: TestMailParams): Promise<SendMailResult> {
  const cfg = getMailConfig()
  return sendTemplatedEmail({
    payload,
    template: 'test_email',
    to,
    data: { sentBy, host: cfg.host, from: `${cfg.fromName} <${cfg.fromEmail}>` },
    relatedType: 'test',
  })
}
