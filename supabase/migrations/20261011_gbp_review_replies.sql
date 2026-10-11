-- ─────────────────────────────────────────────────────────────────────────────
-- Review reply drafts (AHPRA / privacy-checked) with human approval + audit trail
-- Requires 20261009_gbp_review_sources.sql. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-practice reply settings
create table if not exists gbp_reply_settings (
  practice_id         uuid primary key references practices(id) on delete cascade,
  contact_phone       text,                       -- e.g. practice manager line
  contact_email       text,
  contact_role        text not null default 'Practice Manager',
  signoff             text not null default 'The Oromax team',
  clinician_names     text[] not null default '{}',  -- never allowed in a reply
  blocked_terms       text[] not null default '{}',  -- extra practice-specific terms
  draft_window_days   integer not null default 90,   -- only draft for reviews newer than this
  auto_draft          boolean not null default true, -- draft new reviews in the weekly cron
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
alter table gbp_reply_settings enable row level security;

-- One reply workflow row per review. Every state change is kept in `history`.
create table if not exists gbp_reply_drafts (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references practices(id) on delete cascade,
  review_id       uuid not null unique references gbp_reviews(id) on delete cascade,
  category        text not null check (category in ('positive','negative','mixed','no_reply')),
  draft_text      text,                 -- what the system proposed (after checks)
  model_text      text,                 -- raw model output, kept for audit
  used_template   boolean not null default false,
  check_flags     jsonb not null default '[]',   -- [{rule, match}] found in the model text
  status          text not null default 'pending'
                  check (status in ('pending','posted','skipped','failed')),
  final_text      text,                 -- what was actually posted
  decided_by      uuid,
  decided_at      timestamptz,
  posted_at       timestamptz,
  error           text,
  history         jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_gbp_reply_drafts_status on gbp_reply_drafts (practice_id, status);
alter table gbp_reply_drafts enable row level security;

-- Read access for users of the practice; all writes via server routes (service role)
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'gbp_reply_settings' and policyname = 'gbp_reply_settings_read') then
    create policy gbp_reply_settings_read on gbp_reply_settings for select using (
      exists (select 1 from user_profiles p where p.id = auth.uid()
              and (p.role = 'superadmin' or p.practice_id = gbp_reply_settings.practice_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'gbp_reply_drafts' and policyname = 'gbp_reply_drafts_read') then
    create policy gbp_reply_drafts_read on gbp_reply_drafts for select using (
      exists (select 1 from user_profiles p where p.id = auth.uid()
              and (p.role = 'superadmin' or p.practice_id = gbp_reply_drafts.practice_id)));
  end if;
end $$;
