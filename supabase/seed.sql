-- Mati Ride — seed reference data
-- Safe to re-run (upserts / ON CONFLICT DO NOTHING).
--
-- WARNING — PLACEHOLDER DATA
--   * Zone centroids below are approximate and must be replaced with verified
--     coordinates from the LGU / a field survey. [VERIFY]
--   * Fare values are placeholders. Replace them with the approved fare matrix
--     before any real pilot. [VERIFY: ordinance number and rates]
--   * Zone and barangay names must be confirmed against the official list. [VERIFY]

-- ---------------------------------------------------------------------------
-- App settings
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, description) values
  ('city_name', '"Mati City"'::jsonb, 'City shown in the app header'),
  ('platform_name', '"Mati Ride"'::jsonb, 'Product name'),
  ('currency', '"PHP"'::jsonb, 'Currency code'),
  ('base_fare', '15'::jsonb, 'Fallback base fare when no matrix row exists [VERIFY]'),
  ('per_km_rate', '10'::jsonb, 'Fallback per-km rate [VERIFY]'),
  ('commission_rate', '0.10'::jsonb, 'Platform commission as a fraction of fare [VERIFY with drivers]'),
  ('discount_rate', '0.20'::jsonb, 'Senior/student/PWD discount [VERIFY: required by ordinance]'),
  ('sos_response_target_minutes', '10'::jsonb, 'Internal SOS target, not a promise [VERIFY with responders]'),
  ('fare_matrix_is_placeholder', 'true'::jsonb, 'Set to false once the LGU-approved matrix is loaded')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Fare zones (fixed ids so the matrix below can reference them)
-- Coordinates are placeholders. [VERIFY all]
-- ---------------------------------------------------------------------------

insert into public.fare_zones (id, name, centroid_lat, centroid_lng) values
  ('00000000-0000-0000-0000-000000000001', 'Poblacion (City Proper)', 6.9550, 126.2166),
  ('00000000-0000-0000-0000-000000000002', 'Public Market (Palengke)', 6.9570, 126.2135),
  ('00000000-0000-0000-0000-000000000003', 'City Hall', 6.9510, 126.2170),
  ('00000000-0000-0000-0000-000000000004', 'DOrSU Main Campus', 6.9560, 126.2050),
  ('00000000-0000-0000-0000-000000000005', 'Baywalk', 6.9530, 126.2200),
  ('00000000-0000-0000-0000-000000000006', 'Dahican Beach', 6.9420, 126.2680),
  ('00000000-0000-0000-0000-000000000007', 'Sleeping Dinosaur viewpoint', 6.9500, 126.2400),
  ('00000000-0000-0000-0000-000000000008', 'Matiao', 6.9800, 126.2000)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Fare matrix (both directions, tricycle + tuktuk)
-- Every fare here is a PLACEHOLDER. [VERIFY]
-- ---------------------------------------------------------------------------

do $$
declare
  v_matrix jsonb := '[
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002",15,20],
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000003",15,20],
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000004",20,25],
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000005",15,20],
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000006",150,200],
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000007",80,120],
    ["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000008",60,90]
  ]'::jsonb;
  v_row jsonb;
  v_a uuid;
  v_b uuid;
  v_tri numeric;
  v_tuk numeric;
begin
  for v_row in select * from jsonb_array_elements(v_matrix)
  loop
    v_a := (v_row ->> 0)::uuid;
    v_b := (v_row ->> 1)::uuid;
    v_tri := (v_row ->> 2)::numeric;
    v_tuk := (v_row ->> 3)::numeric;

    insert into public.fare_matrix (origin_zone, dest_zone, vehicle_type, fare)
    values (v_a, v_b, 'tricycle', v_tri), (v_b, v_a, 'tricycle', v_tri),
           (v_a, v_b, 'tuktuk', v_tuk), (v_b, v_a, 'tuktuk', v_tuk)
    on conflict (origin_zone, dest_zone, vehicle_type) do nothing;
  end loop;
end $$;
