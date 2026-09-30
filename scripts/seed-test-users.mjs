/**
 * Creates three confirmed test accounts so local testing does not depend on
 * email verification: a passenger, a verified driver (with a vehicle), and an
 * admin. Idempotent — existing emails are skipped.
 *
 * Usage:
 *   $env:SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<pooler>:5432/postgres"
 *   node scripts/seed-test-users.mjs
 */
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Set SUPABASE_DB_URL first.')
  process.exit(1)
}

const PASSWORD = 'matiride123'
const USERS = [
  { email: 'passenger@matiride.test', name: 'Test Passenger', role: 'passenger' },
  { email: 'driver@matiride.test', name: 'Test Driver', role: 'driver' },
  { email: 'admin@matiride.test', name: 'LGU Admin', role: 'admin' },
]

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function ensureIdentity(id, email) {
  const existing = await client.query(
    "select 1 from auth.identities where user_id = $1 and provider = 'email'",
    [id],
  )
  if (existing.rowCount > 0) return false
  await client.query(
    `insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::text, $1::uuid, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now(), now())`,
    [id, email],
  )
  return true
}

async function createUser({ email, name, role }) {
  const existing = await client.query('select id from auth.users where email = $1', [email])
  if (existing.rowCount > 0) {
    const id = existing.rows[0].id
    await ensureIdentity(id, email)
    return { email, id, created: false }
  }

  const meta = { full_name: name, phone: '09000000000' }
  if (role === 'driver') meta.role = 'driver'

  const inserted = await client.query(
    `insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        $1, crypt($2, gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb,
        '', '', '', ''
     )
     returning id`,
    [email, PASSWORD, JSON.stringify(meta)],
  )
  const id = inserted.rows[0].id

  await ensureIdentity(id, email)

  return { email, id, created: true }
}

async function main() {
  await client.connect()
  const results = []
  for (const user of USERS) {
    results.push(await createUser(user))
  }

  const admin = results.find((r) => r.email === 'admin@matiride.test')
  await client.query("update public.profiles set role = 'admin' where id = $1", [admin.id])

  // Verified driver with a vehicle, so matching works immediately.
  const driverUser = results.find((r) => r.email === 'driver@matiride.test')
  const existingDriver = await client.query('select id from public.drivers where profile_id = $1', [driverUser.id])
  if (existingDriver.rowCount === 0) {
    const driver = await client.query(
      `insert into public.drivers (profile_id, license_no, status, is_online, last_lat, last_lng, rating, rating_count)
       values ($1, 'TEST-LIC-001', 'verified', false, 6.9550, 126.2166, 4.80, 12)
       returning id`,
      [driverUser.id],
    )
    await client.query(
      `insert into public.vehicles (driver_id, type, plate_no, unit_no, franchise_no, verified)
       values ($1, 'tricycle', 'TEST-001', '01', 'FRANCHISE-TEST-001', true)`,
      [driver.rows[0].id],
    )
    console.log('Created verified driver + tricycle.')
  } else {
    console.log('Driver record already exists.')
  }

  console.log('\nTest accounts (password: %s):', PASSWORD)
  for (const r of results) {
    console.log(`  ${r.email}${r.created ? '' : '  (already existed)'}`)
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
