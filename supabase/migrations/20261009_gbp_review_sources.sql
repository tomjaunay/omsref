-- ─────────────────────────────────────────────────────────────────────────────
-- Google Business Profile review sources + quarterly buckets
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Google account connection (one per practice). Refresh token is AES-GCM
--    encrypted by the app (TOKEN_ENC_KEY) and this table has NO RLS policies,
--    so only the service-role key (server-side) can read or write it.
create table if not exists gbp_connections (
  id                       uuid primary key default gen_random_uuid(),
  practice_id              uuid not null unique references practices(id) on delete cascade,
  google_email             text,
  refresh_token_enc        text not null,
  connected_by             uuid,
  connected_at             timestamptz not null default now(),
  last_error               text
);
alter table gbp_connections enable row level security;

-- 2. Business Profile locations discovered on the connected account.
--    `selected` = include this profile as a review source.
create table if not exists gbp_locations (
  id               uuid primary key default gen_random_uuid(),
  practice_id      uuid not null references practices(id) on delete cascade,
  account_name     text not null,            -- accounts/123
  location_name    text not null,            -- locations/456
  title            text not null,
  address          text,
  site_label       text,                     -- short label for reports, e.g. 'Miranda'
  selected         boolean not null default false,
  total_reviews    integer,                  -- as reported by Google at last sync
  average_rating   numeric(3,2),
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  unique (practice_id, location_name)
);
alter table gbp_locations enable row level security;

-- 3. Individual reviews. Reviewer name/photo are deliberately NOT stored.
create table if not exists gbp_reviews (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references practices(id) on delete cascade,
  location_id         uuid not null references gbp_locations(id) on delete cascade,
  google_review_id    text not null,
  star_rating         smallint not null check (star_rating between 1 and 5),
  comment             text,
  create_time         timestamptz not null,
  update_time         timestamptz,
  reply_comment       text,
  reply_update_time   timestamptz,
  -- Calendar quarter in Sydney time, matching the existing '2026Q3' period format
  quarter             text generated always as (
                        (extract(year    from (create_time at time zone 'Australia/Sydney'))::int)::text
                        || 'Q' ||
                        (extract(quarter from (create_time at time zone 'Australia/Sydney'))::int)::text
                      ) stored,
  synced_at           timestamptz not null default now(),
  unique (location_id, google_review_id)
);
create index if not exists idx_gbp_reviews_bucket on gbp_reviews (practice_id, quarter, location_id);
alter table gbp_reviews enable row level security;

-- Read access for users of the practice (superadmin sees all). Writes go through
-- server routes using the service-role key, so no insert/update policies.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'gbp_locations' and policyname = 'gbp_locations_read') then
    create policy gbp_locations_read on gbp_locations for select using (
      exists (select 1 from user_profiles p where p.id = auth.uid()
              and (p.role = 'superadmin' or p.practice_id = gbp_locations.practice_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'gbp_reviews' and policyname = 'gbp_reviews_read') then
    create policy gbp_reviews_read on gbp_reviews for select using (
      exists (select 1 from user_profiles p where p.id = auth.uid()
              and (p.role = 'superadmin' or p.practice_id = gbp_reviews.practice_id)));
  end if;
end $$;

-- 4. Quarterly bucket view: one row per practice × quarter × source profile.
--    Combined ('all') rows are produced by the API by summing selected profiles.
create or replace view gbp_review_buckets with (security_invoker = true) as
select
  r.practice_id,
  r.quarter,
  r.location_id,
  l.title,
  l.site_label,
  l.selected,
  count(*)                                         as review_count,
  count(*) filter (where coalesce(r.comment, '') <> '') as with_text,
  round(avg(r.star_rating)::numeric, 2)            as avg_rating,
  count(*) filter (where r.star_rating >= 4)       as positive_ratings,
  count(*) filter (where r.star_rating <= 2)       as negative_ratings,
  count(*) filter (where r.reply_comment is null)  as unreplied,
  min(r.create_time)                               as first_review,
  max(r.create_time)                               as last_review
from gbp_reviews r
join gbp_locations l on l.id = r.location_id
group by r.practice_id, r.quarter, r.location_id, l.title, l.site_label, l.selected;

-- 5. Scope on the existing analysis tables: 'all' (combined, the existing
--    behaviour) or a gbp_locations.id for a single-profile analysis.
alter table review_uploads      add column if not exists scope text not null default 'all';
alter table review_uploads      add column if not exists source text not null default 'manual';  -- manual | gbp
alter table review_theme_scores add column if not exists scope text not null default 'all';

-- Replace any unique constraint/index on review_uploads(practice_id, period)
-- with one that includes scope.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class t on t.oid = con.conrelid
    where t.relname = 'review_uploads' and con.contype = 'u'
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(con.conkey) k join pg_attribute a on a.attrelid = t.oid and a.attnum = k)
          = array['period','practice_id']
  loop
    execute format('alter table review_uploads drop constraint %I', c.conname);
  end loop;

  for c in
    select i.indexrelid::regclass::text as idx
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    where t.relname = 'review_uploads' and i.indisunique and not i.indisprimary
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(i.indkey) k join pg_attribute a on a.attrelid = t.oid and a.attnum = k)
          = array['period','practice_id']
  loop
    execute format('drop index %s', c.idx);
  end loop;
end $$;

create unique index if not exists review_uploads_practice_period_scope
  on review_uploads (practice_id, period, scope);
create index if not exists idx_review_theme_scores_scope
  on review_theme_scores (practice_id, period, scope);
