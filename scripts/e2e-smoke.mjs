/**
 * End-to-end smoke test against the live project using real user tokens.
 * Exercises: sign-in, request_booking (server fare), set_driver_presence,
 * accept_booking, the transition chain, payment creation, and rating.
 *
 * Usage:
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_ANON_KEY="<anon key>"
 *   node scripts/e2e-smoke.mjs
 */
const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY.')
  process.exit(1)
}

const PASSWORD = 'matiride123'
let failures = 0

function ok(label, extra = '') {
  console.log(`  PASS  ${label}${extra ? ` — ${extra}` : ''}`)
}
function bad(label, detail) {
  failures += 1
  console.log(`  FAIL  ${label} — ${detail}`)
}

async function signIn(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

async function rpc(token, name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function select(token, path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`select ${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : []
}

async function main() {
  const [passenger, driver, admin] = await Promise.all([
    signIn('passenger@matiride.test'),
    signIn('driver@matiride.test'),
    signIn('admin@matiride.test'),
  ])
  ok('sign-in for passenger, driver, admin')

  const profiles = await select(admin, 'profiles?select=id,role')
  const roles = profiles.map((p) => p.role).sort()
  if (roles.includes('admin') && roles.includes('driver') && roles.includes('passenger')) {
    ok('roles present', roles.join(', '))
  } else {
    bad('roles present', roles.join(', '))
  }

  const booking = await rpc(passenger, 'request_booking', {
    p_vehicle_type: 'tricycle',
    p_origin_zone: '00000000-0000-0000-0000-000000000001',
    p_dest_zone: '00000000-0000-0000-0000-000000000002',
    p_origin_lat: 6.955,
    p_origin_lng: 126.2166,
    p_origin_label: 'Poblacion',
    p_dest_lat: 6.957,
    p_dest_lng: 126.2135,
    p_dest_label: 'Palengke',
    p_discount_type: null,
    p_passenger_count: 1,
    p_has_luggage: false,
  })
  if (booking?.id && Number(booking.fare) === 15) {
    ok('request_booking with server fare', `fare ${booking.fare}`)
  } else {
    bad('request_booking with server fare', JSON.stringify(booking))
  }

  await rpc(driver, 'set_driver_presence', { p_is_online: true, p_lat: 6.955, p_lng: 126.2166 })
  const nearby = await rpc(passenger, 'find_nearby_drivers', {
    p_lat: 6.955,
    p_lng: 126.2166,
    p_vehicle_type: 'tricycle',
    p_limit: 5,
  })
  if (Array.isArray(nearby) && nearby.length > 0) ok('find_nearby_drivers', `${nearby.length} driver(s)`)
  else bad('find_nearby_drivers', JSON.stringify(nearby))

  const accepted = await rpc(driver, 'accept_booking', { p_booking_id: booking.id })
  if (accepted?.status === 'assigned') ok('accept_booking', accepted.status)
  else bad('accept_booking', JSON.stringify(accepted))

  for (const to of ['arrived', 'in_progress', 'completed']) {
    const result = await rpc(driver, 'transition_booking', {
      p_booking_id: booking.id,
      p_to: to,
      p_note: null,
    })
    if (result?.status === to) ok(`transition -> ${to}`)
    else bad(`transition -> ${to}`, JSON.stringify(result))
  }

  const payments = await select(passenger, `payments?booking_id=eq.${booking.id}&select=amount,commission,driver_net,status`)
  if (payments.length === 1) {
    ok('payment recorded', `net ${payments[0].driver_net}, commission ${payments[0].commission}`)
  } else {
    bad('payment recorded', JSON.stringify(payments))
  }

  const ratingRes = await fetch(`${URL_}/rest/v1/ratings`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${passenger}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      booking_id: booking.id,
      rater_role: 'passenger',
      rater_id: (await select(passenger, 'profiles?select=id'))[0].id,
      stars: 5,
      comment: 'smoke test',
    }),
  })
  if (ratingRes.ok) ok('rating insert')
  else bad('rating insert', `${ratingRes.status} ${await ratingRes.text()}`)

  const sos = await fetch(`${URL_}/rest/v1/sos_alerts`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${passenger}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      booking_id: booking.id,
      triggered_by: (await select(passenger, 'profiles?select=id'))[0].id,
      lat: 6.955,
      lng: 126.2166,
      status: 'open',
    }),
  })
  if (sos.ok || sos.status === 201) ok('sos insert')
  else bad('sos insert', `${sos.status} ${await sos.text()}`)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error('SMOKE TEST ERROR:', error.message)
  process.exit(1)
})
