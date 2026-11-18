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
import { Media } from './collections/Media'
import { StudentEnquiries } from './collections/StudentEnquiries'
import { Students } from './collections/Students'
import { StudentAssessments } from './collections/StudentAssessments'
import { StudentTests } from './collections/StudentTests'
import { StudentTestPayments } from './collections/StudentTestPayments'
import { StudentTestReports } from './collections/StudentTestReports'
import { StudentTestReportShares } from './collections/StudentTestReportShares'
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
dotenvConfig()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  cors: '*',
  csrf: [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:3000',
    'http://localhost:3004',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
  ],
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    StudentEnquiries,
    Students,
    StudentAssessments,
    StudentTests,
    StudentTestPayments,
    StudentTestReports,
    StudentTestReportShares,
    TeacherDocuments,
    TeacherEnquiries,
    TeacherEvaluations,
    TeacherMatches,
    TeacherAllocations,
    EnquiryAuditLog,
    TeacherProfiles,
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
  plugins: [],
})
