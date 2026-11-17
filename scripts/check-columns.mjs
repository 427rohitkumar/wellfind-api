import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    const s = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'student_enquiries' 
      ORDER BY ordinal_position
    `)
    console.log('student_enquiries columns:')
    for (const c of s.rows) {
      console.log(`  ${c.column_name} | ${c.data_type} | default=${c.column_default}`)
    }

    const t = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'teacher_enquiries' 
      ORDER BY ordinal_position
    `)
    console.log('\nteacher_enquiries columns:')
    for (const c of t.rows) {
      console.log(`  ${c.column_name} | ${c.data_type} | default=${c.column_default}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(console.error)
