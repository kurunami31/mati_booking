/**
 * Applies every migration in supabase/migrations in filename order, then
 * optionally the seed.
 *
 * A file is split into separate transactions wherever a line contains `--;;;`
 * so statements that cannot share a transaction (e.g. a new enum value) run on
 * their own.
 *
 *   $env:SUPABASE_DB_URL="postgresql://postgres.<ref>:<pw>@<pooler>:5432/postgres"
 *   node scripts/migrate.mjs            # migrations only
 *   node scripts/migrate.mjs --seed     # migrations + seed
 */
import { readdirSync, readFileSync } from 'node:fs'
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
const migrationsDir = resolve(root, 'supabase/migrations')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
    const chunks = sql
      .split(/^\s*--;;;\s*$/m)
      .map((c) => c.trim())
      .filter(Boolean)

    for (const chunk of chunks) {
      await client.query(chunk)
    }
    console.log(`applied ${file} (${chunks.length} chunk${chunks.length === 1 ? '' : 's'})`)
  }

  if (process.argv.includes('--seed')) {
    await client.query(readFileSync(resolve(root, 'supabase/seed.sql'), 'utf8'))
    console.log('applied seed.sql')
  }
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
