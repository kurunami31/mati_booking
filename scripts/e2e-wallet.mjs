/**
 * End-to-end test for the mock wallet and simulated e-wallet payments.
 *   $env:SUPABASE_URL / $env:SUPABASE_ANON_KEY
 *   node scripts/e2e-wallet.mjs
 */
const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY.')
  process.exit(1)
}

const PASSWORD = 'matiride123'
let failures = 0
const ok = (l, e = '') => console.log(`  PASS  ${l}${e ? ` — ${e}` : ''}`)
const bad = (l, d) => { failures += 1; console.log(`  FAIL  ${l} — ${d}`) }

async function signIn(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}

async function rpc(token, name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

async function newBooking(token, passengerLabel) {
  return rpc(token, 'request_booking', {
    p_vehicle_type: 'tricycle',
    p_origin_zone: '00000000-0000-0000-0000-000000000001',
    p_dest_zone: '00000000-0000-0000-0000-000000000002',
    p_origin_lat: 6.955, p_origin_lng: 126.2166, p_origin_label: passengerLabel,
    p_dest_lat: 6.957, p_dest_lng: 126.2135, p_dest_label: 'Palengke',
    p_discount_type: null, p_passenger_count: 1, p_has_luggage: false,
  })
}

const main = async () => {
  const passenger = await signIn('passenger@matiride.test')
  ok('sign-in passenger')

  const balance = await rpc(passenger, 'wallet_topup', { p_amount: 500 })
  if (typeof balance === 'number' && balance >= 500) ok('wallet_topup', `balance ${balance}`)
  else bad('wallet_topup', JSON.stringify(balance))

  const b1 = await newBooking(passenger, 'Wallet test')
  const pay1 = await rpc(passenger, 'wallet_pay_booking', { p_booking_id: b1.id })
  if (pay1?.status === 'paid') ok('wallet_pay_booking', `${pay1.provider} ${pay1.amount}`)
  else bad('wallet_pay_booking', JSON.stringify(pay1))

  const p1 = await select(passenger, `payments?booking_id=eq.${b1.id}&select=status,method,provider,paid_at`)
  if (p1[0]?.status === 'paid' && p1[0]?.method === 'ewallet') ok('payment row (wallet)', JSON.stringify(p1[0]))
  else bad('payment row (wallet)', JSON.stringify(p1))

  const b2 = await newBooking(passenger, 'E-wallet test')
  const pay2 = await rpc(passenger, 'mock_ewallet_pay', { p_booking_id: b2.id, p_provider: 'gcash' })
  if (pay2?.status === 'paid' && pay2?.provider === 'gcash') ok('mock_ewallet_pay', pay2.provider_ref)
  else bad('mock_ewallet_pay', JSON.stringify(pay2))

  const b3 = await select(passenger, `bookings?id=eq.${b1.id}&select=payment_method`)
  if (b3[0]?.payment_method === 'ewallet') ok('booking marked ewallet')
  else bad('booking marked ewallet', JSON.stringify(b3))

  const tx = await select(passenger, 'wallet_transactions?select=kind,amount&order=created_at.desc&limit=3')
  if (tx.some((t) => t.kind === 'topup') && tx.some((t) => t.kind === 'ride_payment')) ok('wallet transactions')
  else bad('wallet transactions', JSON.stringify(tx))

  console.log(`\n${failures === 0 ? 'ALL WALLET CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  if (failures) process.exit(1)
}

main().catch((e) => { console.error('WALLET TEST ERROR:', e.message); process.exit(1) })
