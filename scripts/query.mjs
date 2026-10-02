/**
 * Runs a SQL file and prints the result rows as JSON.
 *
 *   $env:SUPABASE_DB_URL="..."
 *   node scripts/query.mjs path/to/query.sql
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'

const sql = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : 'select 1 as ok'
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  const result = await client.query(sql)
  const rows = Array.isArray(result) ? result.flatMap((r) => r.rows ?? []) : result.rows
  console.log(JSON.stringify(rows, null, 2))
} finally {
  await client.end()
}
