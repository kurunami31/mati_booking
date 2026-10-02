// SakayTa — `route` edge function
//
// Real road routing + ETA via OpenRouteService, cached in public.route_cache.
// Called by the Flutter app and the PWA with the caller's JWT (verify_jwt on).
//
// Deploy:
//   supabase functions deploy route --project-ref <ref>
//   supabase secrets set ORS_API_KEY=<key> --project-ref <ref>

import { createClient } from 'npm:@supabase/supabase-js@2'

const ORS_KEY = Deno.env.get('ORS_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const round4 = (n: number) => Math.round(n * 10000) / 10000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!ORS_KEY) return json({ error: 'ORS_API_KEY not configured' }, 500)

  let payload: { from?: unknown; to?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const from = payload.from as number[] | undefined
  const to = payload.to as number[] | undefined
  if (
    !Array.isArray(from) || !Array.isArray(to) ||
    from.length < 2 || to.length < 2 ||
    typeof from[0] !== 'number' || typeof from[1] !== 'number' ||
    typeof to[0] !== 'number' || typeof to[1] !== 'number'
  ) {
    return json({ error: 'from and to must be [lng, lat]' }, 400)
  }

  const originKey = `${round4(from[0])},${round4(from[1])}`
  const destKey = `${round4(to[0])},${round4(to[1])}`
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: cached } = await supabase
    .from('route_cache')
    .select('distance_m, duration_s, geometry')
    .eq('origin_key', originKey)
    .eq('dest_key', destKey)
    .maybeSingle()

  if (cached) {
    return json({
      distance_m: cached.distance_m,
      duration_s: cached.duration_s,
      geometry: cached.geometry,
      cached: true,
    })
  }

  const res = await fetch(
    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    {
      method: 'POST',
      headers: {
        Authorization: ORS_KEY,
        Accept: 'application/geo+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ coordinates: [from, to] }),
    },
  )

  if (!res.ok) {
    return json({ error: 'routing_failed', status: res.status, detail: await res.text() }, 502)
  }

  const data = await res.json()
  const feature = data?.features?.[0]
  const distance = Math.round(feature?.properties?.summary?.distance ?? 0)
  const duration = Math.round(feature?.properties?.summary?.duration ?? 0)
  const geometry = feature?.geometry?.coordinates ?? []

  await supabase.from('route_cache').upsert(
    {
      origin_key: originKey,
      dest_key: destKey,
      distance_m: distance,
      duration_s: duration,
      geometry,
    },
    { onConflict: 'origin_key,dest_key' },
  )

  return json({ distance_m: distance, duration_s: duration, geometry, cached: false })
})
