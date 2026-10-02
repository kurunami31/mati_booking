/**
 * Reproduces the driver accept -> trip visibility path over the API.
 *   node scripts/e2e-driver-accept.mjs
 */
const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL_ || !ANON) { console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY.'); process.exit(1) }

const PASSWORD = 'matiride123'
let failures = 0
const ok = (l, e = '') => console.log(`  PASS  ${l}${e ? ` — ${e}` : ''}`)
const bad = (l, d) => { failures += 1; console.log(`  FAIL  ${l} — ${d}`) }

async function signIn(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}
async function rpc(token, name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const t = await res.text(); if (!res.ok) throw new Error(`${name}: ${res.status} ${t}`)
  return t ? JSON.parse(t) : null
}
async function select(token, path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  const t = await res.text(); if (!res.ok) throw new Error(`select ${path}: ${res.status} ${t}`)
  return t ? JSON.parse(t) : []
}

const main = async () => {
  const passenger = await signIn('passenger@matiride.test')
  const driver = await signIn('driver@matiride.test')
  ok('sign-in passenger + driver')

  // driver identity
  const me = await select(driver, 'drivers?select=id,status')
  if (me[0]?.status === 'verified') ok('driver verified', me[0].id.slice(0, 8))
  else bad('driver verified', JSON.stringify(me))

  const booking = await rpc(passenger, 'request_booking', {
    p_vehicle_type: 'tricycle', p_origin_zone: '00000000-0000-0000-0000-000000000001',
    p_dest_zone: '00000000-0000-0000-0000-000000000002', p_origin_lat: 6.955, p_origin_lng: 126.2166,
    p_origin_label: 'Poblacion', p_dest_lat: 6.957, p_dest_lng: 126.2135, p_dest_label: 'Palengke',
    p_discount_type: null, p_passenger_count: 1, p_has_luggage: false,
  })
  ok('passenger created request', booking.status)

  const canSeeOpen = await select(driver, `bookings?id=eq.${booking.id}&select=id,status`)
  if (canSeeOpen.length === 1) ok('driver sees the open request (RLS)')
  else bad('driver sees the open request (RLS)', JSON.stringify(canSeeOpen))

  const accepted = await rpc(driver, 'accept_booking', { p_booking_id: booking.id })
  ok('driver accepted', accepted.status)

  // This is the query the trip screen runs.
  const tripQuery = await select(driver, `bookings?driver_id=eq.${me[0].id}&status=in.(requested,assigned,arrived,in_progress)&select=id,status`)
  if (tripQuery.some((b) => b.id === booking.id)) ok('driver trip query finds the ride', JSON.stringify(tripQuery))
  else bad('driver trip query finds the ride', JSON.stringify(tripQuery))

  console.log(`\n${failures === 0 ? 'ACCEPT FLOW OK' : `${failures} CHECK(S) FAILED`}`)
  if (failures) process.exit(1)
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
