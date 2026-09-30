/** Verifies RLS, policies, functions, and triggers after setup. */
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  const rls = await client.query(`
    select c.relname as table, c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `)
  console.log('tables (rls, policies):')
  for (const row of rls.rows) console.log(`  ${row.table}: rls=${row.rls} policies=${row.policies}`)

  const fns = await client.query(`
    select proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and proname in ('request_booking','accept_booking','transition_booking','quote_fare','find_nearby_drivers','set_driver_presence','mark_payment','driver_has_passenger')
    order by proname
  `)
  console.log('functions:', fns.rows.map((r) => r.proname).join(', '))

  const trg = await client.query(`
    select tgname from pg_trigger where tgname = 'on_auth_user_created'
  `)
  console.log('trigger on_auth_user_created:', trg.rowCount > 0)
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
