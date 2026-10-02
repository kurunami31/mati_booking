// SakayTa — send-push edge function (optional FCM path)
//
// This is only used if you later attach a Firebase project. The Flutter app
// already delivers job alerts without it, over Supabase Realtime + local
// notifications. Wiring this up is optional.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//   supabase secrets set PUSH_SECRET=<same value as public.push_config.secret>
//   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
//
// Then enable dispatch:
//   update public.push_config
//      set url = 'https://<ref>.functions.supabase.co/send-push',
//          secret = '<PUSH_SECRET>',
//          enabled = true;
//
// Request body (from public.dispatch_push):
//   { profile_id, title, body, data }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

interface Payload {
  profile_id: string
  title: string
  body: string
  data?: Record<string, unknown>
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUSH_SECRET = Deno.env.get('PUSH_SECRET') ?? ''
const SERVICE_ACCOUNT_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const sa = JSON.parse(SERVICE_ACCOUNT_RAW) as {
    client_email: string
    private_key: string
    project_id: string
  }

  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return { token: cachedToken.value, projectId: sa.project_id }
  }

  const key = await importPKCS8(sa.private_key, 'RS256')
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) throw new Error(`oauth: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in }
  return { token: json.access_token, projectId: sa.project_id }
}

async function sendToToken(
  projectId: string,
  accessToken: string,
  token: string,
  payload: Payload,
): Promise<boolean> {
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload.data ?? {})) {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v)
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: {
            priority: 'high',
            notification: { sound: 'default', channel_id: 'sakayta_alerts' },
          },
        },
      }),
    },
  )
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const secret = req.headers.get('x-push-secret') ?? ''
  if (!PUSH_SECRET || secret !== PUSH_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!SERVICE_ACCOUNT_RAW) {
    return new Response('FCM_SERVICE_ACCOUNT not configured', { status: 500 })
  }

  const payload = (await req.json()) as Payload
  if (!payload?.profile_id) {
    return new Response('profile_id required', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('profile_id', payload.profile_id)

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  const { token: accessToken, projectId } = await getAccessToken()

  let sent = 0
  for (const row of tokens) {
    const ok = await sendToToken(projectId, accessToken, row.token, payload)
    if (ok) {
      sent += 1
    } else {
      // Token is no longer valid; remove it so we stop trying.
      await supabase.from('push_tokens').delete().eq('token', row.token)
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200 })
})
