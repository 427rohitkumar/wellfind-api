import { Pool } from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/esm/index.mjs'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    // List all tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '))

    // List all enum types
    const types = await client.query(`
      SELECT typname FROM pg_type 
      WHERE typtype = 'e' 
      ORDER BY typname
    `)
    console.log('\nEnum types:', types.rows.map(r => r.typname).join(', '))

    // Check enquiry-audit-log columns
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'enquiry-audit-log' 
      ORDER BY ordinal_position
    `)
    if (cols.rows.length > 0) {
      console.log('\nenquiry-audit-log columns:')
      for (const c of cols.rows) {
        console.log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable}`)
      }
    } else {
      console.log('\nenquiry-audit-log table does not exist')
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
