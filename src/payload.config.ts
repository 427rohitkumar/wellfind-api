// Wellfind Academic — Backend API for a managed one-to-one education network (UKG–Class 10)
// Payload CMS configuration providing APIs, authentication, access control, and data management.
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { emailAdapter } from './lib/email'
import { Users } from './collections/Users'
import { EmailLogs } from './collections/EmailLogs'
import { Payments } from './collections/Payments'
import { Media } from './collections/Media'
import { UserFiles } from './collections/UserFiles'
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { cloudinaryAdapter, cloudinaryRootFolder, isCloudinaryConfigured } from './lib/cloudinaryAdapter'
import { StudentEnquiries } from './collections/StudentEnquiries'
import { Students } from './collections/Students'
import { StudentAssessments } from './collections/StudentAssessments'
import { StudentTests } from './collections/StudentTests'
import { StudentTestPayments } from './collections/StudentTestPayments'
import { StudentTestReports } from './collections/StudentTestReports'
import { StudentTestReportShares } from './collections/StudentTestReportShares'
import { EnquiryTests } from './collections/EnquiryTests'
import { TeachingSessions } from './collections/TeachingSessions'
import { TeacherPayouts } from './collections/TeacherPayouts'
import { PushSubscriptions } from './collections/PushSubscriptions'
import { Notifications } from './collections/Notifications'
import { UserDevices } from './collections/UserDevices'
import { DataDeletionRequests } from './collections/DataDeletionRequests'
import { NotificationDeliveries } from './collections/NotificationDeliveries'
import { AllocationWork } from './collections/AllocationWork'
import { TeacherDocuments } from './collections/TeacherDocuments'
import { TeacherEnquiries } from './collections/TeacherEnquiries'
import { TeacherEvaluations } from './collections/TeacherEvaluations'
import { TeacherMatches } from './collections/TeacherMatches'
import { TeacherAllocations } from './collections/TeacherAllocations'
import { TeacherProfiles } from './collections/TeacherProfiles'
import { EnquiryAuditLog } from './collections/EnquiryAuditLog'
import { TeacherEvaluationConfig } from './globals/TeacherEvaluationConfig'

// Load environment variables from .env so that config values such as
// PAYLOAD_SECRET and DATABASE_URL are available regardless of import order
// (vitest workers import this file before setupFiles run, for example).
import { config as dotenvConfig } from 'dotenv'
// Vitest supplies its own isolated env (.env.test); never load the real .env under test.
if (!process.env.VITEST) dotenvConfig()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Build CSRF and CORS origin whitelist from env with dev origins included
function buildCsrfOrigins(): string[] {
  const devOrigins = [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:5173',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    'http://127.0.0.1:5173',
    'http://10.0.2.2:3004',
    'http://10.0.2.2:8081',
  ]
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return fromEnv.length > 0 ? [...fromEnv, ...devOrigins] : devOrigins
}

function buildCorsOrigins(): string[] | '*' {
  const envVal = process.env.ALLOWED_ORIGINS?.trim()
  if (!envVal || envVal === '*') return '*'
  const fromEnv = envVal.split(',').map((o) => o.trim()).filter(Boolean)
  const devOrigins = [
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3004',
  ]
  return [...fromEnv, ...devOrigins]
}

export default buildConfig({
  cors: buildCorsOrigins(),
  csrf: buildCsrfOrigins(),
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    UserFiles,
    StudentEnquiries,
    Students,
    StudentAssessments,
    StudentTests,
    StudentTestPayments,
    StudentTestReports,
    StudentTestReportShares,
    EnquiryTests,
    TeachingSessions,
    TeacherPayouts,
    PushSubscriptions,
    Notifications,
    UserDevices,
    NotificationDeliveries,
    DataDeletionRequests,
    AllocationWork,
    TeacherDocuments,
    TeacherEnquiries,
    TeacherEvaluations,
    TeacherMatches,
    TeacherAllocations,
    EnquiryAuditLog,
    TeacherProfiles,
    EmailLogs,
    Payments,
  ],
  globals: [TeacherEvaluationConfig],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  email: emailAdapter,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [
    // Files go to Cloudinary once CLOUDINARY_* are set in .env; until then Payload keeps using local disk.
    cloudStoragePlugin({
      enabled: isCloudinaryConfigured(),
      alwaysInsertFields: true,
      collections: {
        media: { adapter: cloudinaryAdapter({ access: 'public' }), prefix: `${cloudinaryRootFolder()}/media`, disablePayloadAccessControl: true },
        'user-files': { adapter: cloudinaryAdapter({ access: 'private' }), prefix: `${cloudinaryRootFolder()}/user-files` },
        'teacher-documents': { adapter: cloudinaryAdapter({ access: 'private' }), prefix: `${cloudinaryRootFolder()}/kyc` },
      },
    }),
  ],
})
