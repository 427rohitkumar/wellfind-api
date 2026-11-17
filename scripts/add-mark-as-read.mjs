import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    console.log('Adding mark_as_read column to student_enquiries...')
    await client.query(`
      ALTER TABLE student_enquiries 
      ADD COLUMN IF NOT EXISTS mark_as_read boolean DEFAULT false;
    `)
    await client.query(`
      UPDATE student_enquiries 
      SET mark_as_read = false 
      WHERE mark_as_read IS NULL;
    `)

    console.log('Adding mark_as_read column to teacher_enquiries...')
    await client.query(`
      ALTER TABLE teacher_enquiries 
      ADD COLUMN IF NOT EXISTS mark_as_read boolean DEFAULT false;
    `)
    await client.query(`
      UPDATE teacher_enquiries 
      SET mark_as_read = false 
      WHERE mark_as_read IS NULL;
    `)

    console.log('Verifying columns...')
    const s = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'student_enquiries' AND column_name = 'mark_as_read'
    `)
    console.log('student_enquiries mark_as_read:', s.rows[0])

    const t = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'teacher_enquiries' AND column_name = 'mark_as_read'
    `)
    console.log('teacher_enquiries mark_as_read:', t.rows[0])

    const sCount = await client.query('SELECT count(*) as total, count(*) FILTER (WHERE mark_as_read = false) as unread FROM student_enquiries')
    console.log('student_enquiries counts:', sCount.rows[0])

    const tCount = await client.query('SELECT count(*) as total, count(*) FILTER (WHERE mark_as_read = false) as unread FROM teacher_enquiries')
    console.log('teacher_enquiries counts:', tCount.rows[0])

    console.log('Migration successful!')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

