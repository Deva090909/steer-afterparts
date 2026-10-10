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

## Prototype mode (current)
`config.js` has `open: true`: the app opens straight onto the role switcher with no sign-in, and everyone
with the link shares the same live data. To lock it down later, set `open: false` and drop the
`prototype open …` policies (see `supabase/migrations/20261010010000_prototype_open_access.sql`);
the sign-in screen and email allowlist below then take over.

## Access and roles
`access.js` holds one permission table (`PERMS`) that both enforces the rules and draws the
"Who can do what" matrix on **Access & roles**:
- **IT / ERP** grants, edits and removes access for Sales, Quality and Service, and sees data screens only
  (My week, Data uploads, Team & territories, Installed base, Agent map, Access & roles).
- **Department heads** add or remove members of their own team and set their team's territories and primary owner.
- **CFO office** manages leadership accounts (CFO office, IT / ERP, management viewers) and reads every screen.
- Nobody changes their own access; head positions are handed over (edit name / email), never removed.
- Every change needs a reason and is written to the access log (synced as the `access` collection).

## How it works (with sign-in)
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
