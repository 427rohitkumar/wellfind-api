import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function getAllowedOrigin(origin: string | null): string {
  if (!origin) return '*'

  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const allowedList = [
    ...envOrigins,
    'https://wellfindacademic.com',
    'https://www.wellfindacademic.com',
    'https://crm.wellfindacademic.com',
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3004',
  ]

  // If origin matches allowed list or any .wellfindacademic.com subdomain or localhost
  if (
    allowedList.includes('*') ||
    allowedList.includes(origin) ||
    origin.endsWith('.wellfindacademic.com') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  ) {
    return origin
  }

  return allowedList[0] || '*'
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  const allowedOrigin = getAllowedOrigin(origin)

  // Handle preflight OPTIONS requests immediately
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    })
  }

  // Pass request to route handler and append CORS headers to response
  const response = NextResponse.next()
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Vary', 'Origin')

  return response
}

export const middleware = proxy

export const config = {
  matcher: '/api/:path*',
}
