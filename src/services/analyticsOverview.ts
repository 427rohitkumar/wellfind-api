import { runGaReport } from '@/services/googleAnalytics'

/**
 * Everything the CRM "Google Analytics" page shows, in one response.
 * Ranges are explicit dates computed in India time (the site's audience / GA property timezone)
 * so the daily trend can be gap-filled with zero days.
 */

export const ANALYTICS_PERIODS = ['today', 'yesterday', '7d', '28d', '30d', '90d', 'month', 'year'] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

const DAY = 86_400_000
const IST_OFFSET = 5.5 * 3_600_000

const istToday = () => {
  const d = new Date(Date.now() + IST_OFFSET)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)

export function resolveRanges(period: AnalyticsPeriod) {
  const today = istToday()
  let start: Date
  let end: Date = today
  switch (period) {
    case 'today': start = today; break
    case 'yesterday': start = end = addDays(today, -1); break
    case '7d': start = addDays(today, -6); break
    case '30d': start = addDays(today, -29); break
    case '90d': start = addDays(today, -89); break
    case 'month': start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); break
    case 'year': start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1)); break
    case '28d':
    default: start = addDays(today, -27)
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return { start, end, prevStart, prevEnd, days }
}

const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0)
const round1 = (n: number) => Math.round(n * 10) / 10

const TOTAL_METRICS = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'userEngagementDuration', 'eventCount', 'engagedSessions', 'keyEvents']

async function totals(startDate: string, endDate: string) {
  const { rows } = await runGaReport({ metrics: TOTAL_METRICS, startDate, endDate, limit: 1 })
  const r = rows[0] || {}
  const n = (k: string) => Number(r[k] || 0)
  const users = n('activeUsers')
  return {
    users,
    newUsers: n('newUsers'),
    sessions: n('sessions'),
    views: n('screenPageViews'),
    viewsPerUser: users > 0 ? n('screenPageViews') / users : 0,
    engagementTime: users > 0 ? Math.round(n('userEngagementDuration') / users) : 0,
    engagementRate: round1(n('engagementRate') * 100),
    events: n('eventCount'),
    engagedSessions: n('engagedSessions'),
    keyEvents: n('keyEvents'),
  }
}

export async function getAnalyticsOverview(period: AnalyticsPeriod) {
  const { start, end, prevStart, prevEnd } = resolveRanges(period)
  const startDate = ymd(start)
  const endDate = ymd(end)

  const [cur, prev, trendRows, channelRows, pageRows, deviceRows, countryRows, eventRows] = await Promise.all([
    totals(startDate, endDate),
    totals(ymd(prevStart), ymd(prevEnd)),
    runGaReport({ dimensions: ['date'], metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews'], startDate, endDate, limit: 400 }),
    runGaReport({ dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions', 'activeUsers', 'engagementRate', 'keyEvents'], startDate, endDate, orderByMetric: 'sessions', limit: 10 }),
    runGaReport({ dimensions: ['pagePath', 'pageTitle'], metrics: ['screenPageViews', 'activeUsers', 'sessions', 'userEngagementDuration', 'keyEvents'], startDate, endDate, orderByMetric: 'screenPageViews', limit: 6 }),
    runGaReport({ dimensions: ['deviceCategory'], metrics: ['activeUsers'], startDate, endDate, orderByMetric: 'activeUsers', limit: 5 }),
    runGaReport({ dimensions: ['country'], metrics: ['activeUsers'], startDate, endDate, orderByMetric: 'activeUsers', limit: 4 }),
    runGaReport({ dimensions: ['eventName'], metrics: ['eventCount', 'keyEvents'], startDate, endDate, orderByMetric: 'eventCount', limit: 5 }),
  ])

  // Daily trend, with zero days filled in.
  const byDate = new Map<string, Record<string, string | number>>()
  for (const r of trendRows.rows) byDate.set(String(r.date), r)
  const trend: { date: string; activeUsers: number; newUsers: number; sessions: number; views: number }[] = []
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const key = ymd(d).replace(/-/g, '')
    const r = byDate.get(key)
    trend.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }),
      activeUsers: Number(r?.activeUsers || 0),
      newUsers: Number(r?.newUsers || 0),
      sessions: Number(r?.sessions || 0),
      views: Number(r?.screenPageViews || 0),
    })
  }

  const deviceTotal = deviceRows.rows.reduce((s, r) => s + Number(r.activeUsers || 0), 0)

  return {
    period,
    range: { startDate, endDate },
    kpis: {
      users: { value: cur.users, change: pct(cur.users, prev.users) },
      newUsers: { value: cur.newUsers, change: pct(cur.newUsers, prev.newUsers) },
      sessions: { value: cur.sessions, change: pct(cur.sessions, prev.sessions) },
      views: { value: cur.views, change: pct(cur.views, prev.views) },
      viewsPerUser: { value: Math.round(cur.viewsPerUser * 100) / 100, change: pct(cur.viewsPerUser, prev.viewsPerUser) },
      engagementTime: { value: cur.engagementTime, change: pct(cur.engagementTime, prev.engagementTime) },
      engagementRate: { value: cur.engagementRate, change: round1(cur.engagementRate - prev.engagementRate) },
      events: { value: cur.events, change: pct(cur.events, prev.events) },
    },
    summary: { engagedSessions: cur.engagedSessions, keyEvents: cur.keyEvents, returningUsers: Math.max(0, cur.users - cur.newUsers) },
    trend,
    channels: channelRows.rows.map((r) => ({
      channel: String(r.sessionDefaultChannelGroup),
      sessions: Number(r.sessions),
      users: Number(r.activeUsers),
      engagementRate: round1(Number(r.engagementRate) * 100),
      keyEvents: Number(r.keyEvents),
    })),
    landingPages: pageRows.rows.map((r) => ({
      path: String(r.pagePath),
      title: String(r.pageTitle || ''),
      views: Number(r.screenPageViews),
      users: Number(r.activeUsers),
      sessions: Number(r.sessions),
      engagementTime: Number(r.activeUsers) > 0 ? Math.round(Number(r.userEngagementDuration) / Number(r.activeUsers)) : 0,
      keyEvents: Number(r.keyEvents),
    })),
    devices: deviceRows.rows.map((r) => ({
      label: String(r.deviceCategory).replace(/^./, (c) => c.toUpperCase()),
      value: deviceTotal > 0 ? Math.round((Number(r.activeUsers) / deviceTotal) * 100) : 0,
    })),
    geography: countryRows.rows.map((r) => ({ label: String(r.country), value: Number(r.activeUsers) })),
    topEvents: eventRows.rows.map((r) => ({ name: String(r.eventName), count: Number(r.eventCount), keyEvent: Number(r.keyEvents) > 0 })),
  }
}
