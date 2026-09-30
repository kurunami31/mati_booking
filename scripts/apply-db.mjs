/**
 * One-time database setup: applies the schema migration and the seed file.
 *
 * Usage (credentials are never written to disk):
 *   $env:SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
 *   node scripts/apply-db.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Set SUPABASE_DB_URL first.')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  console.log('Connected.')

  console.log('Applying migration (supabase/migrations/0001_init.sql)...')
  await client.query(readFileSync(resolve(root, 'supabase/migrations/0001_init.sql'), 'utf8'))
  console.log('Migration applied.')

  console.log('Applying seed (supabase/seed.sql)...')
  await client.query(readFileSync(resolve(root, 'supabase/seed.sql'), 'utf8'))
  console.log('Seed applied.')

  const zones = await client.query('select count(*)::int as n from public.fare_zones')
  const matrix = await client.query('select count(*)::int as n from public.fare_matrix')
  const settings = await client.query('select count(*)::int as n from public.app_settings')
  console.log(
    `Rows: fare_zones=${zones.rows[0].n} fare_matrix=${matrix.rows[0].n} app_settings=${settings.rows[0].n}`,
  )

  const probe = await client.query("select current_setting('app.settings.jwt_secret', true) as s")
  console.log('jwt_secret readable from db:', Boolean(probe.rows[0].s))
}

main()
  .then(() => client.end())
  .catch(async (error) => {
    console.error('FAILED:', error.message)
    try {
      await client.end()
    } catch {
      // ignore
    }
    process.exit(1)
  })
