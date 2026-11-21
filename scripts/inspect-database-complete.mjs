import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:admin@127.0.0.1:5432/wellfind-db' })

async function inspect() {
  const client = await pool.connect()
  try {
    console.log('=== DATABASE INSPECTION: Wellfind Academic (wellfind-db) ===\n')

    // 1. Get all public tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    const tables = tablesRes.rows.map(r => r.table_name)

    // 2. Count rows in each table
    console.log('--- TABLE RECORD COUNTS ---')
    const counts = {}
    for (const table of tables) {
      const res = await client.query(`SELECT count(*) as count FROM "${table}"`)
      counts[table] = parseInt(res.rows[0].count, 10)
      console.log(`${table.padEnd(40)}: ${counts[table]} records`)
    }

    // 3. Inspect Users table specifically
    console.log('\n--- USERS DETAILS ---')
    const usersRes = await client.query(`
      SELECT id, email, role, status, created_at, updated_at 
      FROM users 
      ORDER BY id ASC
    `)
    console.log(JSON.stringify(usersRes.rows, null, 2))

    // 4. Foreign Key Constraints & Dependencies
    console.log('\n--- FOREIGN KEY CONSTRAINTS ---')
    const fkRes = await client.query(`
      SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `)
    console.log(JSON.stringify(fkRes.rows, null, 2))

    // 5. Inspect Content of Key Business Tables
    console.log('\n--- SUMMARY OF SAMPLES IN BUSINESS TABLES ---')
    for (const t of ['student_enquiries', 'students', 'student_tests', 'student_test_payments', 'student_test_reports', 'teacher_enquiries', 'teacher_profiles', 'teacher_allocations', 'teacher_matches', 'teacher_evaluations', 'media', 'enquiry_audit_log', 'teacher_evaluation_config']) {
      if (tables.includes(t)) {
        const sample = await client.query(`SELECT * FROM "${t}" LIMIT 3`)
        console.log(`\nSample from ${t} (${counts[t]} total):`)
        console.log(JSON.stringify(sample.rows, null, 2))
      }
    }

  } finally {
    client.release()
    await pool.end()
  }
}

inspect().catch(err => {
  console.error('Inspection error:', err)
  process.exit(1)
})
