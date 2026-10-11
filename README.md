# OMFS Referral Analytics — Deployment Guide

## Stack
- **Next.js 14** (App Router) — React frontend + API routes
- **Supabase** — PostgreSQL database (free tier is fine)
- **Vercel** — hosting, automatic deploys from GitHub
- **Anthropic API** — powers the Ask Claude feature (server-side only)

---

## Step 1 — Supabase setup

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (pick the Sydney region for lowest latency)
3. Once the project is ready, go to **SQL Editor → New query**
4. Paste the contents of `supabase/schema.sql` and click **Run**
5. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 2 — GitHub setup

1. Create a new **private** repository on GitHub (private because it'll contain env var references)
2. Push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/omfs-referral-app.git
   git push -u origin main
   ```

---

## Step 3 — Vercel deployment

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **New Project** → import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Before deploying, click **Environment Variables** and add:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `ANTHROPIC_API_KEY` | `sk-ant-...` (from console.anthropic.com) |

5. Click **Deploy** — Vercel builds and gives you a URL like `omfs-referral-app.vercel.app`

Future deploys are automatic: push to `main` on GitHub → Vercel rebuilds in ~30 seconds.

---

## Step 4 — Custom domain (optional)

In Vercel → your project → **Domains**, add your domain (e.g. `referrals.yourpractice.com.au`).

---

## Local development

```bash
cp .env.local.example .env.local
# fill in your Supabase + Anthropic keys in .env.local

npm install
npm run dev
# → http://localhost:3000
```

---

## Security notes

- The `ANTHROPIC_API_KEY` is **only used in `/api/ask/route.ts`** — it is never sent to the browser
- The Supabase anon key is public-safe; Row Level Security in the schema ensures data can only be read/written, not dropped
- For a multi-user practice with role-based access, add Supabase Auth and tighten the RLS policies
- The Vercel URL is public by default; add Vercel Password Protection (Pro plan) or Supabase Auth to restrict access

---

## File structure

```
src/
  app/
    api/
      ask/route.ts        ← Claude API (server-side, key never exposed)
      upload/route.ts     ← CSV upload handler
      periods/route.ts    ← Fetch all data
      periods/[period]/   ← Delete a period
    layout.tsx
    page.tsx
    globals.css
  components/
    Dashboard.tsx         ← Main app UI
    AskClaude.tsx         ← Chat panel
    Sparkline.tsx
    ChangePill.tsx
  lib/
    supabase.ts           ← DB client + helpers
    data.ts               ← Aggregation, formatting, CSV parser
supabase/
  schema.sql              ← Run this once in Supabase SQL editor
```

---

## Google Business Profile review sync (added Oct 2026)

Pulls Google reviews directly from selected business profiles, buckets them by
calendar quarter (Sydney time) per profile, and lets each bucket — combined or
per profile — be coded against the review codebook. A Vercel cron re-syncs weekly
(Monday ~6am Sydney).

### One-off setup
1. **Supabase:** run `supabase/migrations/20261009_gbp_review_sources.sql` in the SQL editor (safe to re-run).
2. **Google Cloud:** in the project approved for Business Profile API access, enable
   *My Business Account Management API*, *My Business Business Information API* and
   *Google My Business API* (v4, reviews). Create an OAuth client (Web application) with
   redirect URI `https://<your-domain>/api/gbp/callback` (and `http://localhost:3000/api/gbp/callback` for dev).
   Put the consent screen in production (testing-mode refresh tokens expire after 7 days).
3. **Vercel env vars:** `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `TOKEN_ENC_KEY`, `CRON_SECRET` (see `.env.local.example`). Redeploy.
4. In the app: **Google Reviews → Sources & quarters → Connect Google account**, sign in
   with the account that manages the profiles, tick the profiles to use, set short report
   labels, **Save selection** (runs the initial backfill).

### Data model
- `gbp_connections` — encrypted refresh token per practice (no RLS policies; service role only)
- `gbp_locations` — discovered profiles, `selected`, `site_label`
- `gbp_reviews` — one row per review; reviewer names/photos are not stored; `quarter` is generated
- `gbp_review_buckets` (view) — practice × quarter × profile counts, rating, unreplied
- `review_uploads` / `review_theme_scores` gain `scope` (`all` = combined, or a location id); `review_uploads` gains `source` (`manual` | `gbp`)

### Routes
`/api/gbp/connect`, `/api/gbp/callback`, `/api/gbp/locations` (list/refresh/update/disconnect),
`/api/gbp/sync` (manual, `full` option), `/api/gbp/cron` (weekly), `/api/gbp/buckets`.
`/api/reviews/analyse` accepts `{ source: 'gbp', period, scope }` to code a stored bucket.

---

## Review replies (AHPRA / privacy-checked, human-approved) — added Oct 2026

**Google Reviews → Replies.** For unreplied reviews inside the draft window (default 90 days)
the app drafts a reply with Claude, runs a deterministic compliance check, and falls back to a
standard template if the draft breaks any rule. Nothing is posted until an admin clicks
**Approve & post**; the check runs again on the final (possibly edited) text and hard-blocks on any flag.
The weekly cron drafts up to 8 new reviews per run when "auto draft" is on.

Rules enforced (`src/lib/replies.ts`): no clinical/treatment/cost terms; nothing implying a patient
relationship ("your visit", "experience", "we have no record"…); no promotional or testimonial
language or offers; no dates; no site, clinician or staff names (configurable list); no personal
names; no repeating the reviewer's words; no links. 1–2 star reviews never get a positive reply.
Spam/abusive/unrelated reviews are marked "Needs a decision" with no draft.

Setup: run `supabase/migrations/20261011_gbp_review_replies.sql`, then in **Replies → Settings**
add the contact phone/email, sign-off and clinician/staff names.
Each reply row keeps the model's raw text, the flags, who approved it, when, and what was posted (`history`).
