# STEER After-Parts Workspace

Role-based after-parts workspace for STEER Engineering (lead / sales / quality / service),
hosted on **Vercel** with **Supabase** as the shared backend.

| Piece | Where |
|---|---|
| App (static, no build step) | `index.html` |
| Supabase adapter (sign-in, shared data, realtime, attachments) | `steer-cloud.js` |
| Supabase project URL + publishable key | `config.js` |
| Supabase client (vendored, v2.45.4) | `vendor/supabase.js` |
| Database schema, RLS, storage bucket | `supabase/migrations/` |
| Vercel headers / caching | `vercel.json` |

## How it works
- Everyone signs in with email + password (or an emailed link). Only emails listed in
  `public.app_users` get in; admins manage that list from the account menu (bottom-right → *Team access…*).
- All shared records (territories, owners, visits, complaints, outcomes, plans, uploaded CSV/Excel
  datasets, settings) live in one table, `public.docs` (`path`, `collection`, `data jsonb`), and sync
  live to every open browser through Supabase Realtime. Offline edits queue and sync on reconnect.
- Photos and documents attached to complaints/visits go to the Storage bucket `attachments`
  (random, unguessable file names).

## Deploy
Every push to `main` deploys to production on Vercel; other branches get preview URLs.
No environment variables are needed (the publishable key is meant for browsers; RLS protects the data).

## One-time Supabase settings (dashboard)
Authentication → URL Configuration:
- **Site URL**: your Vercel production URL (e.g. `https://steer-afterparts.vercel.app`)
- **Redirect URLs**: add `https://steer-afterparts.vercel.app/**` and `https://*-amit-deva-projects.vercel.app/**`

This makes confirmation, sign-in-link and password-reset emails come back to the app.

## Going live with real data
Open *Data uploads*, remove the sample data, then upload the real CSV/Excel files.
