import { BetaAnalyticsDataClient } from '@google-analytics/data'

/**
 * Google Analytics 4 (Data API) access for the admin CRM.
 *
 * Credentials live ONLY on the server (this API) in:
 *   GA4_PROPERTY_ID   numeric property id (Admin > Property details), e.g. 123456789
 *   GA4_CLIENT_EMAIL  service account email
 *   GA4_PRIVATE_KEY   service account private key (the "\n" escapes are handled)
 * The CRM never sees them; it only calls /api/admin/analytics/* as a super admin.
 */

export class AnalyticsError extends Error {
  status: number
  code: string
  constructor(message: string, code: string, status = 502) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function getGaConfig() {
  const propertyId = (process.env.GA4_PROPERTY_ID || '').trim().replace(/^properties\//, '')
  const clientEmail = (process.env.GA4_CLIENT_EMAIL || '').trim()
  let privateKey = (process.env.GA4_PRIVATE_KEY || '').trim()
  // Keys pasted into .env are often wrapped in quotes and use literal \n.
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1)
  }
  privateKey = privateKey.replace(/\\n/g, '\n')
  const missing = [
    !propertyId && 'GA4_PROPERTY_ID',
    !clientEmail && 'GA4_CLIENT_EMAIL',
    !privateKey && 'GA4_PRIVATE_KEY',
  ].filter(Boolean) as string[]
  return { propertyId, clientEmail, privateKey, missing }
}

let cached: { key: string; client: BetaAnalyticsDataClient } | null = null

function getClient() {
  const cfg = getGaConfig()
  if (cfg.missing.length) {
    throw new AnalyticsError(`Google Analytics is not configured. Missing: ${cfg.missing.join(', ')}.`, 'not_configured', 503)
  }
  if (!/^\d+$/.test(cfg.propertyId)) {
    throw new AnalyticsError('GA4_PROPERTY_ID must be the numeric Property ID (not the G-XXXX measurement ID).', 'bad_property_id', 503)
  }
  const key = `${cfg.clientEmail}|${cfg.privateKey.length}`
  if (!cached || cached.key !== key) {
    cached = {
      key,
      client: new BetaAnalyticsDataClient({ credentials: { client_email: cfg.clientEmail, private_key: cfg.privateKey } }),
    }
  }
  return { client: cached.client, property: `properties/${cfg.propertyId}` }
}

/** Maps a Google API failure to a short, actionable message. */
function explain(err: unknown): AnalyticsError {
  const e = err as { code?: number; message?: string; details?: string }
  const text = `${e?.details || ''} ${e?.message || ''}`
  if (/PERMISSION_DENIED|permission/i.test(text) && /has not been used|disabled|SERVICE_DISABLED/i.test(text)) {
    return new AnalyticsError('The Google Analytics Data API is not enabled in your Google Cloud project. Enable "Google Analytics Data API" and retry.', 'api_disabled')
  }
  if (e?.code === 7 || /PERMISSION_DENIED|403/.test(text)) {
    return new AnalyticsError('The service account has no access to this GA4 property. In Google Analytics > Admin > Property access management, add the service account email as Viewer.', 'no_access', 403)
  }
  if (e?.code === 3 || /INVALID_ARGUMENT|404|not found/i.test(text)) {
    return new AnalyticsError('GA4 rejected the request. Check that GA4_PROPERTY_ID is the numeric Property ID.', 'bad_request', 400)
  }
  if (/DECODER|PEM|private key|invalid_grant|UNAUTHENTICATED/i.test(text) || e?.code === 16) {
    return new AnalyticsError('Authentication failed. Check GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY (paste the key with its \\n line breaks, inside quotes).', 'auth_failed', 401)
  }
  return new AnalyticsError(e?.message?.slice(0, 300) || 'Google Analytics request failed.', 'upstream')
}

export interface ReportRequest {
  dimensions?: string[]
  metrics: string[]
  startDate?: string
  endDate?: string
  limit?: number
  orderByMetric?: string
  descending?: boolean
}

/** Thin wrapper over runReport that returns plain rows: [{ <dimension>: string, <metric>: number }]. */
export async function runGaReport(req: ReportRequest) {
  const { client, property } = getClient()
  try {
    const [res] = await client.runReport({
      property,
      dateRanges: [{ startDate: req.startDate || '28daysAgo', endDate: req.endDate || 'today' }],
      dimensions: (req.dimensions || []).map((name) => ({ name })),
      metrics: req.metrics.map((name) => ({ name })),
      limit: req.limit ?? 100,
      ...(req.orderByMetric ? { orderBys: [{ metric: { metricName: req.orderByMetric }, desc: req.descending !== false }] } : {}),
    })
    const dims = req.dimensions || []
    const rows = (res.rows || []).map((row) => {
      const out: Record<string, string | number> = {}
      dims.forEach((d, i) => { out[d] = row.dimensionValues?.[i]?.value ?? '' })
      req.metrics.forEach((m, i) => { out[m] = Number(row.metricValues?.[i]?.value ?? 0) })
      return out
    })
    return { rows, rowCount: res.rowCount ?? rows.length }
  } catch (err) {
    if (err instanceof AnalyticsError) throw err
    throw explain(err)
  }
}

/** Cheap connectivity check used by the CRM to show "connected" / what to fix. */
export async function checkGaConnection() {
  const cfg = getGaConfig()
  if (cfg.missing.length) {
    return { configured: false, connected: false, missing: cfg.missing, propertyId: cfg.propertyId || null, serviceAccount: cfg.clientEmail || null, code: 'not_configured', message: `Missing: ${cfg.missing.join(', ')}` }
  }
  try {
    const { rows } = await runGaReport({ metrics: ['activeUsers', 'sessions'], startDate: '7daysAgo', endDate: 'today', limit: 1 })
    return {
      configured: true,
      connected: true,
      missing: [] as string[],
      propertyId: cfg.propertyId,
      serviceAccount: cfg.clientEmail,
      last7Days: { activeUsers: rows[0]?.activeUsers ?? 0, sessions: rows[0]?.sessions ?? 0 },
    }
  } catch (err) {
    const e = err instanceof AnalyticsError ? err : explain(err)
    return { configured: true, connected: false, missing: [] as string[], propertyId: cfg.propertyId, serviceAccount: cfg.clientEmail, code: e.code, message: e.message }
  }
}
