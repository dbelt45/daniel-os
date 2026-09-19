# Daniel OS

Personal operating system for Daniel Belt, Director of Operations at Turnkey
Services. Tasks, projects, blockers, calendar and key metrics on one page, built
during the 14-day AI Build Curriculum (Project 1, Days 1 and 2).

Live: _add the Vercel URL here once deployed_

## What it does

- Google sign-in. No password is stored by this app.
- Tasks, projects, blockers and metrics, all read from a real Postgres database.
- Today's events read live from the Google Calendar API.
- Every page view and action recorded to an `events` table.
- Integration failures logged and shown honestly in the UI.

## Stack, and why

| Piece | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router | Server components query the database directly, so credentials never reach the browser |
| Database + auth | Supabase (Postgres) | One service covers login, database and row-level security |
| Hosting | Vercel | HTTPS by default, environment variables as the secret store, push to deploy |
| Styling | Tailwind CSS v4 | Mobile-first by default, which the Day 1 ship gate requires |

## Setup from scratch

### 1. Supabase

1. Create a project at supabase.com. Save the database password.
2. **SQL Editor -> New query**, paste all of `supabase/schema.sql`, Run.
3. **Authentication -> Sign In / Providers -> Google**: enable it, and paste the
   Google client ID and secret from step 2 below.
4. **Authentication -> URL Configuration**: set Site URL to the Vercel URL, and
   add `http://localhost:3000/auth/callback` plus
   `https://<your-vercel-url>/auth/callback` as redirect URLs.
5. **Settings -> API**: copy the Project URL, the `anon` key and the
   `service_role` key.

### 2. Google Cloud (for calendar access)

1. console.cloud.google.com, create a project.
2. **APIs & Services -> Library**: enable **Google Calendar API**.
3. **OAuth consent screen**: External, add your own email as a test user, and add
   the scope `.../auth/calendar.readonly`.
4. **Credentials -> Create OAuth client ID -> Web application**. Authorized
   redirect URI is the callback Supabase shows on its Google provider page,
   which looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Copy the client ID and secret back into Supabase (step 1.3).

### 3. Run it locally

```bash
cp .env.example .env.local     # then fill in the values from Supabase
npm install
npm run dev                    # http://localhost:3000
```

### 4. Deploy

```bash
npm i -g vercel && vercel        # first deploy, links the project
vercel --prod
```

Add the same four variables in **Vercel -> Settings -> Environment Variables**.
After that, `git push` deploys automatically.

## Where secrets live

Nowhere in this repo. `.env.local` is gitignored and never committed.

| Secret | Lives in | Reaches the browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env vars | Yes, and that is fine |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env vars | Yes. Safe **only** because row-level security is on every table |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars, server only | **Never** |
| Google access token | `integration_tokens` table, per user | **Never** |

**To rotate a leaked key:** Supabase Dashboard -> Settings -> API -> roll the
key, paste the new value into Vercel, redeploy. For a leaked Google secret,
reset it in Google Cloud Credentials and update Supabase's Google provider. The
old value stops working immediately in both cases.

## Request path, browser to database

1. Browser requests `/dashboard`.
2. `middleware.ts` runs first, refreshes the Supabase session cookie, and
   redirects to `/` if there is no user.
3. The dashboard is a **server component**. It builds a Supabase client from the
   cookie and queries Postgres from the server. The browser never holds a
   database connection.
4. Postgres applies row-level security: every policy is `auth.uid() = user_id`,
   so a query can only ever return that user's rows.
5. Rendered HTML goes back. Only the small interactive parts (completing a task)
   ship JavaScript.

## When an integration fails

`lib/google-calendar.ts` never throws. Every call writes a row to
`integration_log`, success or failure. On failure the calendar card shows an
amber panel naming the cause, rather than an empty card that would read as "no
meetings today". The dashboard's System card shows the most recent failure.

The failure modes it distinguishes: `not_connected` (no token stored),
`expired` (Google returned 401 or 403), `api_error` (anything else, including
network failure).

## Layout

```
app/
  page.tsx                 login
  dashboard/page.tsx       the dashboard, a server component
  auth/callback/route.ts   OAuth return, stores the Google token
  api/track/route.ts       analytics writes
lib/
  supabase/{client,server}.ts
  google-calendar.ts       the Calendar integration, with logging
components/                Card, TaskList, PageView
supabase/schema.sql        tables, indexes, row-level security
middleware.ts              session refresh and route guard
```
