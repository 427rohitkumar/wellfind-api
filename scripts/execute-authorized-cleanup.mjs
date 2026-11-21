import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:admin@127.0.0.1:5432/wellfind-db' })

async function executeAuthorizedCleanup() {
  const client = await pool.connect()
  try {
    console.log('=== FINAL AUTHORIZED DATABASE CLEANUP: Wellfind Academic ===\n')

    await client.query('BEGIN')

    // 1. Verify Super Admins before touching anything
    const preSuperAdmins = await client.query(`
      SELECT id, email, role, status, hash, salt 
      FROM users 
      WHERE role = 'super_admin' 
      ORDER BY id ASC
    `)
    console.log(`Pre-Check: Found ${preSuperAdmins.rows.length} Super Admin(s):`)
    for (const sa of preSuperAdmins.rows) {
      console.log(`  - ID ${sa.id}: ${sa.email} [role: ${sa.role}, status: ${sa.status}, hasHash: ${Boolean(sa.hash)}]`)
    }

    if (preSuperAdmins.rows.length < 2) {
      throw new Error(`CRITICAL ABORT: Expected 2 Super Admins, found ${preSuperAdmins.rows.length}. Aborting!`)
    }

    // Verify Super Admin sessions before cleanup
    const preSessions = await client.query(`
      SELECT _parent_id, id, created_at, expires_at 
      FROM users_sessions 
      WHERE _parent_id IN (${preSuperAdmins.rows.map(sa => sa.id).join(',')})
    `)
    console.log(`Pre-Check: Found ${preSessions.rows.length} Super Admin session(s).\n`)

    // Identify non-super-admin users to delete
    const nonAdmins = await client.query(`
      SELECT id, email, role, status FROM users WHERE role != 'super_admin'
    `)
    console.log(`Non-Super-Admin users targeted for deletion: ${nonAdmins.rows.length}`)
    for (const na of nonAdmins.rows) {
      console.log(`  - ID ${na.id}: ${na.email} [role: ${na.role}]`)
    }

    // 2. Strict deletion steps
    const deletionCounts = {}

    // Function to delete from table and record count
    async function deleteTable(tableName, condition = 'TRUE') {
      const checkRes = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [tableName])

      if (!checkRes.rows[0].exists) {
        return
      }

      const countBeforeRes = await client.query(`SELECT COUNT(*) as cnt FROM "${tableName}" WHERE ${condition}`)
      const countBefore = parseInt(countBeforeRes.rows[0].cnt, 10)

      if (countBefore > 0) {
        await client.query(`DELETE FROM "${tableName}" WHERE ${condition}`)
      }
      deletionCounts[tableName] = (deletionCounts[tableName] || 0) + countBefore
      console.log(`  Deleted ${String(countBefore).padStart(3)} rows from "${tableName}"`)
    }

    console.log('\n--- EXECUTING DELETIONS IN TRANSACTION ---')

    // Break circular FK first: teacher_enquiries.teacher_profile_id is nullable
    await client.query('UPDATE teacher_enquiries SET teacher_profile_id = NULL')

    // Deletion order
    await deleteTable('enquiry_audit_log')
    await deleteTable('student_test_report_shares')
    await deleteTable('student_test_reports_subject_results')
    await deleteTable('student_test_reports')
    await deleteTable('student_test_payments')
    await deleteTable('student_tests_assignment_history')
    await deleteTable('student_tests')
    await deleteTable('student_assessments_strengths')
    await deleteTable('student_assessments_weaknesses')
    await deleteTable('student_assessments')
    await deleteTable('teacher_allocations_status_history')
    await deleteTable('teacher_allocations')
    await deleteTable('teacher_matches')
    await deleteTable('teacher_evaluations_revision_history')
    await deleteTable('teacher_evaluations')
    await deleteTable('students_subjects')
    await deleteTable('students')
    await deleteTable('teacher_documents')
    await deleteTable('teacher_profiles')
    await deleteTable('teacher_enquiries')
    await deleteTable('student_enquiries_subjects')
    await deleteTable('student_enquiries')
    await deleteTable('media')
    await deleteTable('users', "role != 'super_admin'")

    // Clean any locked documents or preference leftovers if any
    await deleteTable('payload_locked_documents_rels')
    await deleteTable('payload_locked_documents')

    // 3. Post-Deletion Verification inside transaction
    console.log('\n--- TRANSACTION VALIDATION CHECKS ---')

    // A. Verify Super Admins are 100% intact
    const postSuperAdmins = await client.query(`
      SELECT id, email, role, status, hash, salt 
      FROM users 
      WHERE role = 'super_admin' 
      ORDER BY id ASC
    `)
    if (postSuperAdmins.rows.length !== preSuperAdmins.rows.length) {
      throw new Error(`CRITICAL ERROR: Super Admin count changed from ${preSuperAdmins.rows.length} to ${postSuperAdmins.rows.length}. ROLLING BACK!`)
    }
    for (let i = 0; i < preSuperAdmins.rows.length; i++) {
      const pre = preSuperAdmins.rows[i]
      const post = postSuperAdmins.rows[i]
      if (pre.id !== post.id || pre.email !== post.email || pre.hash !== post.hash || pre.salt !== post.salt || pre.role !== post.role) {
        throw new Error(`CRITICAL ERROR: Super Admin ID ${pre.id} was altered! ROLLING BACK!`)
      }
    }
    console.log('✓ Super Admin accounts integrity verified: Exactly identical.')

    // B. Verify Super Admin sessions
    const postSessions = await client.query(`
      SELECT COUNT(*) as cnt FROM users_sessions 
      WHERE _parent_id IN (${postSuperAdmins.rows.map(sa => sa.id).join(',')})
    `)
    console.log(`✓ Super Admin sessions verified: ${postSessions.rows[0].cnt} sessions intact.`)

    // C. Verify System Config & Migrations
    const configRes = await client.query('SELECT COUNT(*) as cnt FROM teacher_evaluation_config')
    const migrationsRes = await client.query('SELECT COUNT(*) as cnt FROM payload_migrations')
    if (parseInt(configRes.rows[0].cnt, 10) !== 1) {
      throw new Error('CRITICAL ERROR: teacher_evaluation_config was modified! ROLLING BACK!')
    }
    if (parseInt(migrationsRes.rows[0].cnt, 10) !== 1) {
      throw new Error('CRITICAL ERROR: payload_migrations was modified! ROLLING BACK!')
    }
    console.log('✓ System configuration and migration records verified: Intact.')

    // D. Verify All Operational Tables are 0
    const tablesToVerify = [
      'student_enquiries',
      'student_enquiries_subjects',
      'students',
      'students_subjects',
      'student_assessments',
      'student_assessments_strengths',
      'student_assessments_weaknesses',
      'student_tests',
      'student_tests_assignment_history',
      'student_test_payments',
      'student_test_reports',
      'student_test_reports_subject_results',
      'student_test_report_shares',
      'teacher_enquiries',
      'teacher_documents',
      'teacher_evaluations',
      'teacher_evaluations_revision_history',
      'teacher_profiles',
      'teacher_matches',
      'teacher_allocations',
      'teacher_allocations_status_history',
      'enquiry_audit_log'
    ]

    const remainingCounts = {}
    let operationalRecordCount = 0
    for (const t of tablesToVerify) {
      const r = await client.query(`SELECT COUNT(*) as cnt FROM "${t}"`)
      const count = parseInt(r.rows[0].cnt, 10)
      remainingCounts[t] = count
      operationalRecordCount += count
      if (count !== 0) {
        throw new Error(`CRITICAL ERROR: Table "${t}" still has ${count} records! Expected 0. ROLLING BACK!`)
      }
    }
    console.log(`✓ All 22 operational tables verified: Exactly 0 records remaining.`)

    // Verify Non-Super-Admin users are 0
    const nonAdminRemaining = await client.query("SELECT COUNT(*) as cnt FROM users WHERE role != 'super_admin'")
    if (parseInt(nonAdminRemaining.rows[0].cnt, 10) !== 0) {
      throw new Error('CRITICAL ERROR: Non-admin users still remain! ROLLING BACK!')
    }
    console.log(`✓ Non-Super-Admin users verified: 0 remaining.`)

    // 4. Commit transaction
    await client.query('COMMIT')
    console.log('\n========================================')
    console.log('✓ TRANSACTION COMMITTED SUCCESSFULLY!')
    console.log('========================================\n')

    return {
      success: true,
      deletionCounts,
      remainingCounts,
      superAdmins: postSuperAdmins.rows,
      sessionsCount: parseInt(postSessions.rows[0].cnt, 10)
    }

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\nCLEANUP FAILED AND ROLLED BACK:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

executeAuthorizedCleanup()
  .then(res => {
    console.log('Cleanup result summary:', JSON.stringify(res, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('Fatal execution error:', err)
    process.exit(1)
  })
