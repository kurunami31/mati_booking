# SakayTa

Booking app for tricycles and tuk-tuk/bao-bao in Mati City, Davao Oriental.
Passengers see a fixed fare before booking, get an assigned driver, and can raise an SOS
during a trip. Drivers stop doing tuyok-tuyok and receive ride requests instead.

This is the MVP: passenger, driver, and admin/LGU in one installable PWA, backed by
Supabase. Payments are cash only and the SOS alert is logged for the admin — no live
emergency dispatch is wired up.

## Stack

- React 19 + Vite 8 + TypeScript, Tailwind v4
- React Router 7
- Supabase (Postgres, Auth, Realtime, RLS)
- Leaflet for maps
- PWA via `vite-plugin-pwa` (installable, offline shell)
- Vitest for unit tests, oxlint for linting

## Setup

1. Install dependencies.

   ```
   npm install
   ```

2. Create a Supabase project, then run the SQL in the Supabase SQL editor (in order):

   - `supabase/migrations/0001_init.sql` — tables, RLS, and RPCs
   - `supabase/migrations/0002_integrity.sql` — request/presence expiry, rating
     aggregation, reliability counters
   - `supabase/seed.sql` — Mati zones, placeholder fare matrix, app settings

   Or apply everything from the command line (needs the pooler connection
   string; see `scripts/migrate.mjs`):

   ```
   $env:SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<pooler>:5432/postgres"
   node scripts/migrate.mjs --seed
   ```

3. Copy `.env.local.example` to `.env.local` and paste your project values
   (Dashboard → Project Settings → API):

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. Run the app.

   ```
   npm run dev
   ```

5. Create accounts in the app: a passenger, a driver, and (after signup) promote one
   profile to admin by running this in the SQL editor:

   ```sql
   update public.profiles set role = 'admin' where id = (
     select id from auth.users where email = 'you@example.com'
   );
   ```

   Admin is never self-selectable during signup. Drivers enter onboarding after signup
   and stay `pending` until an admin approves them in the Verification tab.

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck and production build
- `npm run preview` — preview the build
- `npm run lint` — oxlint
- `npx vitest run` — unit tests for fare and geo logic

## How the pieces fit

- **Fares** are computed on the server in `public.quote_fare`, preferring the LGU fare
  matrix and falling back to `base_fare + per_km_rate * distance`. The client preview in
  `src/lib/fare.ts` mirrors the same formula; the server value is stored on the booking.
- **Booking state** changes go through `public.transition_booking`, which enforces the
  allowed transitions and actor for each step. The UI never writes status directly.
- **Matching** is a broadcast model: a `requested` booking is visible to verified, online
  drivers of the matching vehicle type, and `public.accept_booking` is atomic so the first
  accept wins. Directed "nearest driver first" dispatch is a later phase.
- **Offline**: bookings, status changes, and SOS attempts are queued in `localStorage`
  (`src/lib/offline.ts`) and flushed when the connection returns (`useOfflineSync`).
- **SOS** writes to `sos_alerts`; the admin SOS panel acknowledges and closes alerts.
- **Expiry and integrity** (`0002_integrity.sql`): unaccepted requests expire, stale
  driver presence is cleared, ratings aggregate into `drivers.rating`, and reliability
  counters are driven by `trip_events`. Scheduled with `pg_cron` where available.

## Dark corners in this MVP

- Cash commission is recorded but not truly collected; settlement is manual.
- E-wallet payment is modeled but not implemented.
- Driver ID photos are stored as a pasted URL, not an upload.
- The fare matrix and zone centroids in `seed.sql` are placeholders.
- No SMS fallback, no masked calling, no push notifications.
- Maps use the public OpenStreetMap tiles; check the tile usage policy before scale.

## Before a real pilot — confirm with the LGU and agencies

Everything below is marked `[VERIFY]` in the code and must be confirmed. This is not legal
advice.

| Topic | Confirm | With |
| --- | --- | --- |
| Fare matrix | The approved fare rates and the ordinance number | Mati City Hall / city council |
| Franchise | How tricycle and tuk-tuk/bao-bao franchises are issued and listed | LGU franchising body |
| Term | Whether "bao-bao" is the local term, or "tuk-tuk" only | Local drivers and residents |
| Terminals | Dispatcher roles, cuts, and queue rules | Terminal operators, driver groups |
| Vehicle class | Whether tuk-tuk/bao-bao are regulated as tricycles | LTFRB, LTO, DILG |
| Privacy | DPO, privacy impact assessment, consent, retention (RA 10173) | NPC, legal counsel |
| Payments | Treatment of commissions and driver payouts | BIR |
| Insurance | Existing TPL/passenger cover, gaps for app trips | Insurers, operators |
| SOS routing | Who receives alerts and the real response protocol | PNP Mati, MDRRMO, 911 |
| Coverage | Signal on pilot routes and known dead zones | Telcos |
| Commission | The percentage drivers will accept | Driver associations and cooperatives |
