import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:admin@127.0.0.1:5432/wellfind-db' })

async function runCleanup(isExecute = false) {
  const client = await pool.connect()
  try {
    console.log(`=== DATABASE CLEANUP SCRIPT [Mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN'}] ===\n`)

    if (!isExecute) {
      console.log('DRY-RUN MODE: No database changes will be committed.\n')
    }

    await client.query('BEGIN')

    // 1. Identify Super Admin users dynamically
    const superAdminsRes = await client.query(`
      SELECT id, email, role, status FROM users WHERE role = 'super_admin' ORDER BY id ASC
    `)
    console.log(`Identified ${superAdminsRes.rows.length} Super Admin account(s) to PRESERVE:`)
    for (const sa of superAdminsRes.rows) {
      console.log(`  - ID ${sa.id}: ${sa.email} [role: ${sa.role}, status: ${sa.status}]`)
    }

    // 2. Identify Non-Super Admin users to REMOVE
    const nonAdminsRes = await client.query(`
      SELECT id, email, role, status FROM users WHERE role != 'super_admin' ORDER BY id ASC
    `)
    console.log(`\nIdentified ${nonAdminsRes.rows.length} Non-Super Admin account(s) to REMOVE:`)
    for (const na of nonAdminsRes.rows) {
      console.log(`  - ID ${na.id}: ${na.email} [role: ${na.role}, status: ${na.status}]`)
    }

    // Table deletion list in reverse dependency order
    const deletionPlan = [
      { table: 'enquiry_audit_log', condition: 'TRUE' },
      { table: 'teacher_allocations_status_history', condition: 'TRUE' },
      { table: 'teacher_allocations', condition: 'TRUE' },
      { table: 'teacher_matches', condition: 'TRUE' },
      { table: 'teacher_evaluations_revision_history', condition: 'TRUE' },
      { table: 'teacher_evaluations', condition: 'TRUE' },
      { table: 'teacher_enquiries_subjects', condition: 'TRUE', optional: true },
      { table: 'break_fk_teacher_profile', customSql: 'UPDATE teacher_enquiries SET teacher_profile_id = NULL; UPDATE teacher_profiles SET teacher_enquiry_id = NULL;' },
      { table: 'teacher_enquiries', condition: 'TRUE' },
      { table: 'teacher_documents', condition: 'TRUE' },
      { table: 'teacher_profiles', condition: 'TRUE' },
      { table: 'student_test_report_shares', condition: 'TRUE' },
      { table: 'student_test_reports_subject_results', condition: 'TRUE' },
      { table: 'student_test_reports', condition: 'TRUE' },
      { table: 'student_test_payments', condition: 'TRUE' },
      { table: 'student_tests_assignment_history', condition: 'TRUE' },
      { table: 'student_tests', condition: 'TRUE' },
      { table: 'student_assessments_strengths', condition: 'TRUE' },
      { table: 'student_assessments_weaknesses', condition: 'TRUE' },
      { table: 'student_assessments', condition: 'TRUE' },
      { table: 'students_subjects', condition: 'TRUE' },
      { table: 'students', condition: 'TRUE' },
      { table: 'student_enquiries_subjects', condition: 'TRUE' },
      { table: 'student_enquiries', condition: 'TRUE' },
      { table: 'media', condition: 'TRUE' },
      { table: 'users', condition: "role != 'super_admin'" }
    ]

    console.log('\n--- PLANNED DELETION COUNTS ---')
    let totalDeleted = 0
    for (const step of deletionPlan) {
      if (step.customSql) {
        if (isExecute) {
          await client.query(step.customSql)
        }
        continue
      }
      
      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [step.table])

      if (!tableCheck.rows[0].exists) {
        continue
      }

      const countRes = await client.query(`SELECT COUNT(*) as cnt FROM "${step.table}" WHERE ${step.condition}`)
      const count = parseInt(countRes.rows[0].cnt, 10)
      console.log(`  ${step.table.padEnd(36)}: ${count} record(s) to remove`)
      totalDeleted += count

      if (isExecute && count > 0) {
        await client.query(`DELETE FROM "${step.table}" WHERE ${step.condition}`)
      }
    }

    console.log(`\nTotal business/test records targeted for deletion: ${totalDeleted}`)

    if (isExecute) {
      await client.query('COMMIT')
      console.log('\nSUCCESS: Database cleanup COMMITTED successfully.')
    } else {
      await client.query('ROLLBACK')
      console.log('\nDRY-RUN COMPLETE: Transaction safely ROLLED BACK. Zero records were altered.')
    }

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error during cleanup:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

const isExecute = process.argv.includes('--execute')
runCleanup(isExecute).catch(err => {
  console.error(err)
  process.exit(1)
})
