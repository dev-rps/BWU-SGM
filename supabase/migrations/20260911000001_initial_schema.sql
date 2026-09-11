-- ==============================================================================
-- Migration: 20260911000001_initial_schema.sql
-- Project:   Safety Guardian (BWU-SGM)
-- Description: Complete Postgres schema for Supabase covering user identity,
--              medical profile, emergency contacts, community hazard reports,
--              SOS distress gateway, live location sharing, travel history,
--              route suggestions, 26-feature ML vectors, journey reviews,
--              route-safety feedback loop, and ML retraining samples.
-- ==============================================================================

-- ── 1. Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── 2. Utility Functions & Triggers ───────────────────────────────────────────

-- Automatic timestamp updater
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- ── 3. Profiles (Tied to Supabase Auth Identity) ───────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  member_since text default to_char(now(), 'YYYY'),
  pref_avoid_unlit boolean not null default true,
  pref_auto_share_walk boolean not null default false,
  pref_safe_zone_alerts boolean not null default true,
  pref_live_friend_tracking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: auto-create profile on auth.users signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url, member_since)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', null),
    to_char(now(), 'YYYY')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_current_timestamp_updated_at();

-- ── 4. Medical Profiles ───────────────────────────────────────────────────────
create table if not exists public.medical_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  blood_group text,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  conditions text[] not null default '{}'::text[],
  other_conditions text,
  allergies text[] not null default '{}'::text[],
  other_allergies text,
  medicines jsonb not null default '[]'::jsonb,
  emergency_medicines jsonb not null default '[]'::jsonb,
  doctor_name text,
  doctor_hospital text,
  doctor_phone text,
  insurance_provider text,
  insurance_policy_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_medical_profiles_updated_at on public.medical_profiles;
create trigger set_medical_profiles_updated_at
  before update on public.medical_profiles
  for each row execute function public.set_current_timestamp_updated_at();

-- ── 5. Emergency Contacts ─────────────────────────────────────────────────────
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text,
  priority integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emergency_contacts_user_id on public.emergency_contacts(user_id);
create index if not exists idx_emergency_contacts_priority on public.emergency_contacts(user_id, priority);

drop trigger if exists set_emergency_contacts_updated_at on public.emergency_contacts;
create trigger set_emergency_contacts_updated_at
  before update on public.emergency_contacts
  for each row execute function public.set_current_timestamp_updated_at();

-- ── 6. Hazard Reports ─────────────────────────────────────────────────────────
create table if not exists public.hazard_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  user_email text,
  user_photo text,
  hazard_type text not null,
  hazard_label text not null,
  hazard_category text not null check (
    hazard_category in ('traffic', 'natural', 'fire', 'infrastructure', 'crime', 'public', 'other')
  ),
  severity text not null check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  description text,
  image_url text,
  latitude double precision not null,
  longitude double precision not null,
  location_name text,
  formatted_address text,
  is_anonymous boolean not null default false,
  status text not null default 'active' check (
    status in ('active', 'verified', 'resolved', 'dismissed')
  ),
  verification_count integer not null default 0,
  upvotes uuid[] not null default '{}'::uuid[],
  downvotes uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hazard_reports_coords on public.hazard_reports(latitude, longitude);
create index if not exists idx_hazard_reports_status on public.hazard_reports(status);
create index if not exists idx_hazard_reports_created_at on public.hazard_reports(created_at desc);

drop trigger if exists set_hazard_reports_updated_at on public.hazard_reports;
create trigger set_hazard_reports_updated_at
  before update on public.hazard_reports
  for each row execute function public.set_current_timestamp_updated_at();

-- RPC Function for voting on a hazard report
create or replace function public.vote_hazard_report(
  report_id uuid,
  vote_type text
)
returns void as $$
declare
  calling_user uuid := auth.uid();
begin
  if calling_user is null then
    raise exception 'Authentication required to vote.';
  end if;

  if vote_type = 'up' then
    update public.hazard_reports
    set upvotes   = case when calling_user = any(upvotes) then array_remove(upvotes, calling_user) else array_append(upvotes, calling_user) end,
        downvotes = array_remove(downvotes, calling_user),
        updated_at = now()
    where id = report_id;
  elsif vote_type = 'down' then
    update public.hazard_reports
    set downvotes = case when calling_user = any(downvotes) then array_remove(downvotes, calling_user) else array_append(downvotes, calling_user) end,
        upvotes   = array_remove(upvotes, calling_user),
        updated_at = now()
    where id = report_id;
  else
    raise exception 'Invalid vote type: %', vote_type;
  end if;
end;
$$ language plpgsql security definer;

-- ── 7. SOS Distress Events ───────────────────────────────────────────────────
create table if not exists public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text,
  user_phone text,
  user_email text,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'whatsapp_sent', 'sms_sent', 'call_attempted', 'completed', 'failed')
  ),
  latitude double precision not null,
  longitude double precision not null,
  accuracy numeric,
  maps_link text,
  emergency_type text not null default 'general',
  contacts_snapshot jsonb not null default '[]'::jsonb,
  whatsapp_status text not null default 'pending',
  sms_status text not null default 'pending',
  call_status text not null default 'pending',
  retry_count integer not null default 0,
  failure_reason text,
  logs jsonb not null default '[]'::jsonb,
  gateway_id text,
  processed_at timestamptz,
  whatsapp_sent_at timestamptz,
  sms_sent_at timestamptz,
  call_attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sos_events_user_id on public.sos_events(user_id);
create index if not exists idx_sos_events_status on public.sos_events(status);

drop trigger if exists set_sos_events_updated_at on public.sos_events;
create trigger set_sos_events_updated_at
  before update on public.sos_events
  for each row execute function public.set_current_timestamp_updated_at();

-- ── 8. Live Locations (Friend Tracking / People Near Me) ──────────────────────
create table if not exists public.live_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  display_name text,
  avatar_url text,
  speed numeric,
  heading numeric,
  updated_at timestamptz not null default now()
);

create index if not exists idx_live_locations_coords on public.live_locations(latitude, longitude);
create index if not exists idx_live_locations_updated_at on public.live_locations(updated_at desc);

-- ── 9. Journeys / Trip History ────────────────────────────────────────────────
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_location_name text,
  start_latitude double precision not null,
  start_longitude double precision not null,
  start_address text,
  destination_name text,
  destination_latitude double precision not null,
  destination_longitude double precision not null,
  destination_address text,
  travel_mode text not null default 'pedestrian',
  status text not null default 'active' check (
    status in ('active', 'completed', 'cancelled')
  ),
  distance_meters numeric,
  duration_seconds numeric,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_journeys_user_id on public.journeys(user_id);
create index if not exists idx_journeys_status on public.journeys(status);

drop trigger if exists set_journeys_updated_at on public.journeys;
create trigger set_journeys_updated_at
  before update on public.journeys
  for each row execute function public.set_current_timestamp_updated_at();

-- ── 10. Route Evaluations & Suggestions ───────────────────────────────────────
create table if not exists public.route_evaluations (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references public.journeys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_index integer not null default 0,
  route_name text,
  distance_meters numeric,
  duration_seconds numeric,
  traffic_level text default 'clear',
  geometry jsonb not null,
  predicted_safety_score integer not null check (predicted_safety_score between 10 and 100),
  predicted_risk_score numeric not null,
  predicted_risk_level text not null check (predicted_risk_level in ('Low', 'Medium', 'High', 'Critical')),
  class_probabilities jsonb not null default '{}'::jsonb,
  bottleneck_lat double precision,
  bottleneck_lng double precision,
  bottleneck_score integer,
  bottleneck_hazards jsonb,
  nearest_hazards jsonb not null default '{}'::jsonb,
  explanatory_reasons text[] not null default '{}'::text[],
  model_version text not null default '3.0.0',
  live_weather_snapshot jsonb,
  live_aqi_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_route_evaluations_journey_id on public.route_evaluations(journey_id);
create index if not exists idx_route_evaluations_user_id on public.route_evaluations(user_id);

-- ── 11. Route ML Features (Full 26-Feature Vector Representation) ─────────────
create table if not exists public.route_ml_features (
  id uuid primary key default gen_random_uuid(),
  route_evaluation_id uuid not null references public.route_evaluations(id) on delete cascade,
  checkpoint_index integer not null default -1, -- -1 denotes corridor aggregate
  latitude double precision,
  longitude double precision,

  -- Spatial proximity (BallTrees)
  crime_min_dist_km numeric,
  crime_density_500m numeric,
  crime_weighted_risk numeric,
  accident_min_dist_km numeric,
  accident_density_500m numeric,
  accident_weighted_risk numeric,
  flood_min_dist_km numeric,
  in_flood_zone numeric,
  disaster_min_dist_km numeric,
  in_disaster_zone numeric,

  -- Temporal dynamics
  hour_sin numeric,
  hour_cos numeric,
  day_sin numeric,
  day_cos numeric,
  is_night numeric,
  is_weekend numeric,
  is_rush_hour numeric,

  -- Environmental & Meteorological
  temperature numeric,
  visibility_km numeric,
  weather_severity numeric,
  precipitation_risk numeric,
  aqi_pm25 numeric,
  air_quality_severity numeric,

  -- Road Infrastructure (OSM)
  lighting_score numeric,
  police_proximity_km numeric,
  road_hierarchy_rank numeric,

  created_at timestamptz not null default now()
);

create index if not exists idx_route_ml_features_eval_id on public.route_ml_features(route_evaluation_id);

-- ── 12. Journey Reviews (Existing 4-Level Sentiment Review) ───────────────────
create table if not exists public.journey_reviews (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references public.journeys(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating text not null check (rating in ('danger', 'bad', 'good', 'great')),
  created_at timestamptz not null default now()
);

create index if not exists idx_journey_reviews_user_id on public.journey_reviews(user_id);
create index if not exists idx_journey_reviews_journey_id on public.journey_reviews(journey_id);

-- ── 13. Route Safety Feedback (NEW: ML Retraining Feedback Loop) ──────────────
create table if not exists public.route_safety_feedbacks (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references public.journeys(id) on delete set null,
  route_evaluation_id uuid not null references public.route_evaluations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  predicted_safety_score integer not null,
  predicted_risk_level text not null,
  perceived_safety_score integer not null check (perceived_safety_score between 1 and 100),
  actual_lighting text check (actual_lighting in ('dark', 'poorly_lit', 'well_lit', 'daylight')),
  actual_weather_condition text,
  encountered_hazards text[] not null default '{}'::text[],
  felt_safe_at_bottleneck boolean,
  diverted_from_route boolean not null default false,
  deviation_reason text,
  user_comments text,
  computed_ground_truth_risk numeric check (computed_ground_truth_risk between 10.0 and 100.0),
  created_at timestamptz not null default now()
);

create index if not exists idx_route_feedbacks_eval_id on public.route_safety_feedbacks(route_evaluation_id);
create index if not exists idx_route_feedbacks_user_id on public.route_safety_feedbacks(user_id);

-- ── 14. ML Training Samples (Curated Corpus for train.py Retraining) ──────────
create table if not exists public.ml_training_samples (
  id uuid primary key default gen_random_uuid(),
  source_feedback_id uuid references public.route_safety_feedbacks(id) on delete set null,
  route_evaluation_id uuid references public.route_evaluations(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  feature_vector jsonb not null,
  target_safety_score numeric not null,
  target_risk_level text not null check (target_risk_level in ('Low', 'Medium', 'High')),
  dataset_split text not null default 'train' check (dataset_split in ('train', 'validation', 'test')),
  verified_by text not null default 'user_feedback',
  created_at timestamptz not null default now()
);

create index if not exists idx_ml_training_samples_split on public.ml_training_samples(dataset_split);

-- ── 15. Row Level Security (RLS) Configuration ────────────────────────────────

alter table public.profiles enable row level security;
alter table public.medical_profiles enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.hazard_reports enable row level security;
alter table public.sos_events enable row level security;
alter table public.live_locations enable row level security;
alter table public.journeys enable row level security;
alter table public.route_evaluations enable row level security;
alter table public.route_ml_features enable row level security;
alter table public.journey_reviews enable row level security;
alter table public.route_safety_feedbacks enable row level security;
alter table public.ml_training_samples enable row level security;

-- Profiles Policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Medical Profiles Policies
create policy "Users can view their own medical profile"
  on public.medical_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own medical profile"
  on public.medical_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own medical profile"
  on public.medical_profiles for update
  using (auth.uid() = user_id);

-- Emergency Contacts Policies
create policy "Users can manage their own emergency contacts"
  on public.emergency_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Hazard Reports Policies (Community Shared)
create policy "Everyone can view active hazard reports"
  on public.hazard_reports for select
  using (true);

create policy "Authenticated users can create hazard reports"
  on public.hazard_reports for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "Users can update their own hazard reports"
  on public.hazard_reports for update
  using (auth.uid() = user_id);

create policy "Users can delete their own hazard reports"
  on public.hazard_reports for delete
  using (auth.uid() = user_id);

-- SOS Events Policies
create policy "Users can view their own SOS events"
  on public.sos_events for select
  using (auth.uid() = user_id);

create policy "Users can create their own SOS events"
  on public.sos_events for insert
  with check (auth.uid() = user_id);

create policy "Service role can manage all SOS events"
  on public.sos_events for all
  using (auth.jwt()->>'role' = 'service_role');

-- Live Locations Policies (Ephemerally shared among active authenticated users)
create policy "Authenticated users can view recent live locations"
  on public.live_locations for select
  to authenticated
  using (updated_at > now() - interval '5 minutes');

create policy "Users can upsert their own live location"
  on public.live_locations for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own live location"
  on public.live_locations for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own live location"
  on public.live_locations for delete
  to authenticated
  using (auth.uid() = user_id);

-- Journeys Policies
create policy "Users can manage their own journeys"
  on public.journeys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Route Evaluations Policies
create policy "Users can view and create route evaluations"
  on public.route_evaluations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Route ML Features Policies
create policy "Users can view route features for their routes"
  on public.route_ml_features for select
  using (
    exists (
      select 1 from public.route_evaluations re
      where re.id = route_ml_features.route_evaluation_id
      and re.user_id = auth.uid()
    )
  );

create policy "Users can insert route features for their routes"
  on public.route_ml_features for insert
  with check (
    exists (
      select 1 from public.route_evaluations re
      where re.id = route_ml_features.route_evaluation_id
      and re.user_id = auth.uid()
    )
  );

-- Journey Reviews Policies
create policy "Users can manage their own journey reviews"
  on public.journey_reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Route Safety Feedbacks Policies
create policy "Users can manage their own route feedbacks"
  on public.route_safety_feedbacks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role can read route feedbacks for model retraining"
  on public.route_safety_feedbacks for select
  using (auth.jwt()->>'role' = 'service_role');

-- ML Training Samples Policies
create policy "Service role can manage ML training samples"
  on public.ml_training_samples for all
  using (auth.jwt()->>'role' = 'service_role');

create policy "Authenticated users can read ML training samples for inspection"
  on public.ml_training_samples for select
  to authenticated
  using (true);
