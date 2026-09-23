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
5. Copy the client ID and secret back into Supabase (step 1.3), and also into
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The app uses them to renew the
   hourly Google token, so the calendar keeps working without signing in again.

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

Add the same six variables in **Vercel -> Settings -> Environment Variables**.
After that, `git push` deploys automatically.

## Where secrets live

Nowhere in this repo. `.env.local` is gitignored and never committed.

| Secret | Lives in | Reaches the browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env vars | Yes, and that is fine |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env vars | Yes. Safe **only** because row-level security is on every table |
| `OPENROUTER_API_KEY` | Vercel env vars, server only | **Never** |
| `GITHUB_TOKEN` (read-only, fine-grained) | Vercel env vars, server only | **Never** |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Vercel env vars, server only | **Never** |
| Google access and refresh tokens | `integration_tokens` table, per user | **Never** |

**To rotate a leaked key:** make a new one where it came from (Supabase
Dashboard -> Settings -> API, openrouter.ai -> Keys, github.com -> Settings ->
Developer settings), paste the new value into Vercel, redeploy, then delete the
old one. For a leaked Google secret,
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

## What happens when an integration fails

Every outside system this app touches can fail, and none of them are allowed to
take the page down. Each one returns a plain success-or-failure value instead of
throwing, the failure is written to the `integration_log` table, and the card
that depended on it says so on screen.

| System | If it fails | What you see |
|---|---|---|
| Google Calendar | `getTodaysEvents` returns `ok: false` with a reason | The Today card shows "Calendar unavailable" and the reason, never an empty list that reads as "no meetings" |
| GitHub | `getGithubActivity` returns `ok: false` | The Code card shows "GitHub unavailable" and the reason |
| OpenRouter (briefing) | `getBriefing` returns `ok: false` | The briefing box shows "Briefing unavailable" and why. The rest of the dashboard is untouched |
| OpenRouter (chat) | `/api/chat` answers with `ok: false` and an HTTP status | The chat shows "Chat unavailable" in place of a reply, and your question stays on screen |
| Supabase | Queries return an error and the card falls back to its empty state | The card reads as empty. This is the one honest gap: a failed query and a genuinely empty table look the same |
| Analytics | Never surfaced | Tracking failures are swallowed on purpose. Measurement must not break the thing it measures |

The System card at the bottom right always shows the most recent failure of any
kind, so a problem that has since recovered is still visible.

**To see it for yourself:** remove `GITHUB_TOKEN` from the environment and reload.
The Code card explains that no token is configured, the rest of the page is
normal, and a row appears in `integration_log`.

## Today's briefing and the chat

- **The briefing** is the box at the top. It sends the current tasks, projects,
  blockers, metrics, calendar and GitHub activity to Claude and asks for four
  sentences or fewer. It is cached for 30 minutes, so a page refresh does not
  cost another request.
- **The chat** is at the bottom. Claude gets five tools and nothing else: list
  tasks, add a task, complete a task, read status, and read today. Writes are
  limited to your own rows by row level security, exactly like the rest of the app.
- Both share one voice and one model, set in `lib/ai.ts`.
