import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'
import { studentSeedData } from './seed-data-students.mjs'
import { teacherSeedData } from './seed-data-teachers.mjs'
import { randomUUID } from 'crypto'

const isDryRun = process.argv.includes('--dry-run')

function assertDevelopmentEnvironment() {
  const nodeEnv = process.env.NODE_ENV
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seeder: NODE_ENV is production.')
  }
  const dbUrl = process.env.DATABASE_URL || ''
  const isLocal = dbUrl.includes('127.0.0.1') || dbUrl.includes('localhost') || dbUrl === ''
  if (!isLocal) {
    throw new Error('Refusing to run seeder: DATABASE_URL is not local.')
  }
}

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS student_enquiries (
  id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  student_class TEXT NOT NULL, custom_subject TEXT, preferred_timing TEXT NOT NULL,
  locality TEXT NOT NULL, custom_locality TEXT, budget_range TEXT NOT NULL,
  name TEXT NOT NULL, phone_number TEXT NOT NULL, additional_notes TEXT,
  agreed_to_policy BOOLEAN NOT NULL DEFAULT FALSE,
  enquiry_status TEXT NOT NULL DEFAULT 'new', admin_notes TEXT,
  assigned_to_id INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS teacher_documents (
  id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), filename TEXT NOT NULL,
  filesize INTEGER NOT NULL, mimetype TEXT NOT NULL, url TEXT NOT NULL,
  thumbnail_url TEXT, width INTEGER, height INTEGER,
  focal_x DOUBLE PRECISION, focal_y DOUBLE PRECISION, alt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_enquiries (
  id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), full_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL, email TEXT,
  highest_qualification TEXT NOT NULL, teaching_experience TEXT NOT NULL,
  primary_subject TEXT NOT NULL, class_level TEXT NOT NULL,
  teaching_locality TEXT NOT NULL, preferred_availability TEXT NOT NULL,
  additional_notes TEXT, agreed_to_policy BOOLEAN NOT NULL DEFAULT FALSE,
  aadhaar_document_id INTEGER REFERENCES teacher_documents(id),
  qualification_document_id INTEGER REFERENCES teacher_documents(id),
  application_status TEXT NOT NULL DEFAULT 'new', admin_notes TEXT,
  reviewed_by_id INTEGER REFERENCES users(id), reviewed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS student_enquiries_subjects (
  id VARCHAR(255) PRIMARY KEY,
  _order INTEGER NOT NULL,
  _parent_id INTEGER NOT NULL REFERENCES student_enquiries(id) ON DELETE CASCADE,
  subject TEXT NOT NULL
);
`

async function ensureSchema(client) {
  if (isDryRun) {
    console.log('[dry-run] would ensure schema: student_enquiries, teacher_documents, teacher_enquiries, student_enquiries_subjects tables.')
    return
  }
  await client.query(CREATE_TABLES_SQL)
  console.log('Schema ensured: student_enquiries, teacher_documents, teacher_enquiries, student_enquiries_subjects tables.')
}

async function seedStudentEnquiries(client) {
  let created = 0, skipped = 0, repaired = 0
  for (const data of studentSeedData) {
    const existing = await client.query(
      'SELECT id FROM student_enquiries WHERE phone_number = $1 LIMIT 1',
      [data.phoneNumber]
    )

    if (existing.rowCount > 0) {
      const enquiryId = existing.rows[0].id
      const subjectCheck = await client.query(
        'SELECT count(*) AS cnt FROM student_enquiries_subjects WHERE _parent_id = $1',
        [enquiryId]
      )
      const existingSubjectCount = parseInt(subjectCheck.rows[0].cnt, 10)

      if (existingSubjectCount === 0) {
        // Existing enquiry has no subjects — repair by inserting missing subject rows
        if (isDryRun) {
          console.log(`[dry-run] would repair student_enquiries subjects: name=${data.name}, phone_number=${data.phoneNumber}, subjects=${JSON.stringify(data.subjects)}`)
          repaired++
        } else {
          for (let i = 0; i < data.subjects.length; i++) {
            await client.query(
              `INSERT INTO student_enquiries_subjects (id, _order, _parent_id, subject) VALUES ($1, $2, $3, $4)`,
              [randomUUID(), i, enquiryId, data.subjects[i]]
            )
          }
          repaired++
        }
      } else {
        if (isDryRun) {
          console.log(`[dry-run] would skip student_enquiries (already complete): name=${data.name}, phone_number=${data.phoneNumber}`)
        }
        skipped++
      }
      continue
    }

    if (isDryRun) {
      console.log(`[dry-run] would insert student_enquiries: name=${data.name}, phone_number=${data.phoneNumber}, subjects=${JSON.stringify(data.subjects)}`)
      created++
      continue
    }

    const insertResult = await client.query(
      `INSERT INTO student_enquiries (student_class, custom_subject, preferred_timing, locality, custom_locality, budget_range, name, phone_number, additional_notes, agreed_to_policy, enquiry_status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()) RETURNING id`,
      [data.studentClass, data.customSubject, data.preferredTiming, data.locality, data.customLocality, data.budgetRange, data.name, data.phoneNumber, data.additionalNotes, data.agreedToPolicy, data.enquiryStatus]
    )
    const enquiryId = insertResult.rows[0].id

    // Insert subjects into child table — id column has no default, must provide UUID
    for (let i = 0; i < data.subjects.length; i++) {
      await client.query(
        `INSERT INTO student_enquiries_subjects (id, _order, _parent_id, subject) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), i, enquiryId, data.subjects[i]]
      )
    }

    created++
  }
  return { created, skipped, repaired }
}

async function seedTeacherEnquiries(client) {
  let created = 0, skipped = 0
  for (const data of teacherSeedData) {
    const existing = await client.query(
      'SELECT id FROM teacher_enquiries WHERE mobile_number = $1 LIMIT 1',
      [data.mobileNumber]
    )
    if (existing.rowCount > 0) { skipped++; continue }

    if (isDryRun) {
      console.log(`[dry-run] would insert teacher_enquiries: full_name=${data.fullName}, mobile_number=${data.mobileNumber}, email=${data.email}`)
      created++
      continue
    }

    await client.query(
      `INSERT INTO teacher_enquiries (full_name, mobile_number, email, highest_qualification, teaching_experience, primary_subject, class_level, teaching_locality, preferred_availability, additional_notes, agreed_to_policy, application_status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
      [data.fullName, data.mobileNumber, data.email, data.highestQualification, data.teachingExperience, data.primarySubject, data.classLevel, data.teachingLocality, data.preferredAvailability, data.additionalNotes, data.agreedToPolicy, data.applicationStatus]
    )
    created++
  }
  return { created, skipped }
}

async function main() {
  assertDevelopmentEnvironment()
  if (isDryRun) {
    console.log('--- DRY RUN: no data will be inserted ---')
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    console.log('Starting development seeder for enquiries...')
    console.log('Target database: local (NODE_ENV unset/production check passed)')
    if (!isDryRun) {
      await client.query('BEGIN')
    }
    await ensureSchema(client)
    const sr = await seedStudentEnquiries(client)
    console.log(`Student Enquiries: created=${sr.created}, skipped=${sr.skipped}, repaired=${sr.repaired}`)
    const tr = await seedTeacherEnquiries(client)
    console.log(`Teacher Enquiries: created=${tr.created}, skipped=${tr.skipped}`)

    if (!isDryRun) {
      await client.query('COMMIT')
      console.log('\n--- Verification ---')
      const sc = await client.query('SELECT count(*) FROM student_enquiries WHERE phone_number = ANY($1)', [studentSeedData.map((d) => d.phoneNumber)])
      const tc = await client.query('SELECT count(*) FROM teacher_enquiries WHERE mobile_number = ANY($1)', [teacherSeedData.map((d) => d.mobileNumber)])
      console.log(`Student Enquiries seeded: ${sc.rows[0].count}`)
      console.log(`Teacher Enquiries seeded: ${tc.rows[0].count}`)
    }

    console.log('\nSeeder completed successfully.')
  } catch (err) {
    if (!isDryRun) {
      await client.query('ROLLBACK').catch(() => {})
    }
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Seeder failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
