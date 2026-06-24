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
