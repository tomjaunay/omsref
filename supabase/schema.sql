-- Run this in your Supabase SQL editor (Dashboard > SQL Editor > New query)

-- Periods table: one row per quarter uploaded
create table if not exists periods (
  id          uuid primary key default gen_random_uuid(),
  period      text not null unique,   -- e.g. '2025Q1'
  uploaded_at timestamptz default now(),
  uploaded_by text                    -- optional: store uploader name/email
);

-- Referrer rows: one row per referrer per period
create table if not exists referrer_rows (
  id          uuid primary key default gen_random_uuid(),
  period      text not null references periods(period) on delete cascade,
  referrer    text not null,
  practice    text not null default '',
  specialty   text not null default 'Unknown',
  suburb      text not null default '',
  referrals   integer not null default 0,
  income      numeric(12,2) not null default 0
);

-- Index for fast per-period queries
create index if not exists idx_referrer_rows_period on referrer_rows(period);

-- Enable Row Level Security (keeps data private)
alter table periods      enable row level security;
alter table referrer_rows enable row level security;

-- Allow all operations for authenticated and anon users
-- (For a simple practice tool with no user auth, anon access is fine.
--  Tighten this if you add authentication later.)
create policy "allow_all_periods"
  on periods for all using (true) with check (true);

create policy "allow_all_referrer_rows"
  on referrer_rows for all using (true) with check (true);
