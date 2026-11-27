import { v2 as cloudinary } from 'cloudinary'
import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'

/**
 * Cloudinary storage for Payload upload collections (through @payloadcms/plugin-cloud-storage).
 *
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER (optional, default "wellfind").
 * When those are not set the plugin is switched off and Payload keeps storing files on local disk.
 *
 * - `access: 'public'`  -> stored as a normal public asset; the document URL points straight at the Cloudinary CDN (profile photos).
 * - `access: 'private'` -> stored as an "authenticated" asset (no public URL works). Files are served only through
 *   Payload's file route (so Payload's access rules decide who can read them) which fetches a short-lived signed URL.
 *
 * Images use Cloudinary's `image` resource type, everything else (PDF, ...) uses `raw`.
 */

export function isCloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

export function cloudinaryRootFolder(): string {
  return (process.env.CLOUDINARY_FOLDER || 'wellfind').replace(/^\/+|\/+$/g, '')
}

let configured = false
export function ensureCloudinaryConfigured() {
  if (configured) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  configured = true
}
function ensureConfigured() {
  ensureCloudinaryConfigured()
}

const isImage = (mime?: string | null, filename = '') => Boolean(mime?.startsWith('image/')) || /\.(png|jpe?g|webp|gif|avif)$/i.test(filename)
const stripExt = (p: string) => p.replace(/\.[^./]+$/, '')
const extOf = (p: string) => (p.match(/\.([^./]+)$/)?.[1] || '').toLowerCase()
const joinPath = (...parts: (string | undefined | null)[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/')

function target(path: string, image: boolean) {
  return {
    resource_type: (image ? 'image' : 'raw') as 'image' | 'raw',
    // raw assets keep their extension in the public id; image ids have none (format is appended to the URL).
    publicId: image ? stripExt(path) : path,
    format: image ? extOf(path) : undefined,
  }
}

export function cloudinaryAdapter(options: { access: 'public' | 'private' }): Adapter {
  const type = options.access === 'private' ? 'authenticated' : 'upload'

  return (): GeneratedAdapter => ({
    name: 'cloudinary',

    async handleUpload({ file, storageFilePath }) {
      ensureConfigured()
      const image = isImage(file.mimeType, file.filename)
      const t = target(storageFilePath, image)
      await new Promise<void>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: t.publicId, resource_type: t.resource_type, type, overwrite: true, invalidate: true },
          (err) => (err ? reject(err) : resolve()),
        )
        stream.end(file.buffer)
      })
      return undefined as never
    },

    async handleDelete({ doc, filename, storageFilePath }) {
      ensureConfigured()
      const image = isImage((doc as { mimeType?: string }).mimeType, filename)
      const t = target(storageFilePath, image)
      await cloudinary.uploader.destroy(t.publicId, { resource_type: t.resource_type, type, invalidate: true })
    },

    generateURL({ collection, filename, prefix }) {
      // Not configured yet: files are still on local disk, so use Payload's own file route.
      if (!isCloudinaryConfigured()) return `/api/${collection.slug}/file/${encodeURIComponent(filename)}`
      ensureConfigured()
      const path = joinPath(prefix, filename)
      const image = isImage(null, filename)
      const t = target(path, image)
      return cloudinary.url(t.publicId, {
        resource_type: t.resource_type,
        type,
        secure: true,
        format: t.format,
        sign_url: type === 'authenticated',
      })
    },

    async staticHandler(req, { params }) {
      ensureConfigured()
      try {
        const path = joinPath(params.prefix, params.filename)
        const image = isImage(null, params.filename)
        const t = target(path, image)
        const url = cloudinary.url(t.publicId, {
          resource_type: t.resource_type,
          type,
          secure: true,
          format: t.format,
          sign_url: type === 'authenticated',
        })
        const upstream = await fetch(url)
        if (!upstream.ok || !upstream.body) return new Response('File not found.', { status: 404 })
        const headers = new Headers()
        headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
        const len = upstream.headers.get('content-length')
        if (len) headers.set('Content-Length', len)
        headers.set('Cache-Control', type === 'authenticated' ? 'private, max-age=300' : 'public, max-age=86400')
        headers.set('Content-Disposition', `inline; filename="${params.filename.replace(/"/g, '')}"`)
        void req
        return new Response(upstream.body, { status: 200, headers })
      } catch {
        return new Response('Could not load the file.', { status: 502 })
      }
    },
  })
}

/**
 * Upload a Base64 data URL, Buffer, or remote URL directly to Cloudinary.
 * Used for teacher payout QR codes, documents, etc.
 */
export async function uploadToCloudinary(
  fileOrBase64: string | Buffer,
  options?: { folder?: string; publicId?: string; resourceType?: 'image' | 'raw' | 'auto' }
): Promise<{ secureUrl: string; publicId: string }> {
  ensureConfigured()
  const folder = options?.folder || `${cloudinaryRootFolder()}/payout-qr`
  const uploadData =
    typeof fileOrBase64 === 'string'
      ? fileOrBase64
      : `data:application/octet-stream;base64,${fileOrBase64.toString('base64')}`

  const result = await cloudinary.uploader.upload(uploadData, {
    folder,
    public_id: options?.publicId,
    resource_type: options?.resourceType || 'image',
    overwrite: true,
  })

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
  }
}

