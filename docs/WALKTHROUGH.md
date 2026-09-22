# Daniel OS, explained in plain English

Written for the Day 14 questions. Every answer here is something you can point
at in the code. If a question below has an answer you would not say out loud in
your own words, that is the one to reread.

---

## 1. What this thing is

A website only you can log into that shows your day on one page: tasks,
projects, blockers, today's calendar, your recent code, and a few numbers. At
the top it writes you a short briefing about what needs your attention. At the
bottom you can type a question and it answers, or does small things for you.

Four outside systems feed it. Google signs you in, Google Calendar gives today's
events, GitHub gives your recent commits, and a free model on OpenRouter writes the
briefing and runs the chat.

---

## 2. What happens between tapping the link and seeing the page

Say it in this order. It is six steps.

1. **Your phone asks Vercel for the page.** Vercel is the company that runs the
   website. There is no computer of yours involved.
2. **The gatekeeper checks you first.** A file called `middleware.ts` runs before
   anything else and looks for your session cookie. No cookie means you are sent
   to the sign-in page and nothing else happens.
3. **The page code runs on Vercel's server, not in your browser.** That is the
   whole reason the database password never leaves the server.
4. **It asks for everything at once, not one after another.** Tasks, projects,
   blockers, metrics, calendar, GitHub and the briefing all go out together
   (`Promise.all` in `app/dashboard/page.tsx`). The page takes as long as the
   slowest one, not the sum of all of them.
5. **Each answer becomes a card.** If one system failed, that card says so and
   the others are unaffected.
6. **Finished HTML comes back to your phone.** Your browser never talks to the
   database. It could not, even if someone wanted it to.

The chat is the one exception, and it is worth saying: when you type a question,
your browser posts it to `/api/chat`, and that code on the server talks to
Claude. Same rule, your browser still never touches the database or a key.

---

## 3. Where the secrets live, and how you would replace one

There are five, and they live in three different places on purpose. The rule is
simple: **a secret is replaced where it was issued, not where it is used.**

| Secret | Where it is stored | If it leaked, you replace it here |
|---|---|---|
| Google client secret | Supabase Auth only | Google Cloud Console, then paste the new one into Supabase |
| Supabase project URL and publishable key | Vercel environment variables | Supabase settings. These are not really secret, see below |
| Your Google access token for calendar | The `integration_tokens` table, one row, server side only | It expires on its own within an hour, so there is nothing to rotate |
| GitHub token | Vercel environment variables | GitHub, Developer settings, revoke and issue a new one |
| OpenRouter API key | Vercel environment variables | openrouter.ai/keys, delete the key and create another |

**Why the Supabase key in the browser is not a leak.** It only names which
project you are talking to. It carries no identity. Identity comes from your
session cookie, and every table has a rule that says a row is only visible when
its owner matches the person asking. A stranger with that key gets an empty
list, which the check script proves every time it runs.

Nothing sensitive is in the code. The repository holds `.env.example`, which is
a list of names with no values.

---

## 4. What the AI actually sees

This is the question people fumble. The answer is: **only what the code hands
it, and nothing else.**

For the briefing, the code in `lib/briefing.ts` reads your open tasks, active
projects, open blockers, latest metrics, today's calendar and your week of
commits. It turns those rows into plain text, adds one instruction, and sends
that. Claude has no connection to your database and no memory of yesterday. If a
system was down, the words "unavailable" are sent instead of pretending it was
empty, which is why the briefing can tell you a system is broken.

Two deliberate choices you should be ready to defend:

- **The briefing is cached for thirty minutes.** Refreshing the page does not
  buy another briefing. One line in `lib/briefing.ts` holds the last one. The
  honest limit is that this cache lives in the server's memory, so it is per
  server instance, not shared. For one person that is fine. For a team it would
  move into the database.
- **The voice lives in one place.** `lib/ai.ts` holds the model name and the
  writing instructions, so the briefing and the chat cannot drift apart.

---

## 5. How the chat does things, not just says things

Claude cannot reach your database. What it can do is say "I want to use the
add_task tool with this title", and then our code decides whether to run it.

The loop in `app/api/chat/route.ts`, in five lines of English:

1. Send your question, plus a list of the five tools it is allowed to ask for.
2. If Claude answers in words, return that and stop.
3. If Claude asks for a tool, our code runs that tool against the database.
4. Send the result back and let Claude continue.
5. Do that at most five times, then stop and say so.

**The five tools:** list your tasks, add a task, complete a task, read your
status, read your day. That is the whole surface. Two of them write; the other
three only read.

**Why so few.** Every tool is a door. Five doors you can name beat twenty you
cannot. And even the writing tools cannot escape your own rows, because the
database rule from section 3 applies to the chat exactly like it applies to the
page.

**What it cannot do:** delete anything, change a project, touch your calendar,
or reach any Turnkey system. None of those tools exist, so there is nothing to
misuse.

---

## 6. When something breaks

The full table is in the README. The principle is one sentence: **every outside
call returns a success-or-failure answer instead of crashing, the failure is
written to the `integration_log` table, and the card that needed it says what
went wrong.**

The demo, if asked: remove the GitHub token, reload. The Code card explains
itself, everything else is normal, and a new row appears in the log. The System
card at the bottom right always shows the most recent failure, even one that has
already recovered.

---

## 7. The honest limits

Say these before anyone finds them.

- **The calendar only works while you are signed in on the site.** Google's
  token is short-lived and we store no refresh token yet, so nothing outside the
  browser can read your calendar. That is why a morning briefing cannot be
  emailed to you yet.
- **A failed database query and an empty table look the same on screen.** The
  outside systems report their failures honestly; Supabase queries do not, yet.
- **The briefing cache is per server instance,** as described above.
- **The chat has no memory between visits.** Reload the page and it has
  forgotten. History is kept in the browser tab only, and only the last twenty
  turns are sent.
- **One person.** Every design choice assumes a single user. Nothing here is
  wrong for a team, but the cache and the seed file would both need to change.

---

## 8. Lightning round

Short answers, in your own voice.

**Where does the code run?** On Vercel's servers, except the chat box and the
task checkboxes, which run in the browser and call back to the server.

**What stops someone reading my tasks?** A rule on every table that compares the
row's owner to whoever is asking. No match, no row.

**What is Supabase?** A Postgres database with sign-in and an API wrapped around
it. It stores rows, not files.

**Why Next.js?** Because the page code runs on the server, so a secret never has
to travel to the browser to be useful.

**Why Claude and not something cheaper?** The briefing runs twice a day at most
and the chat is a handful of questions, so the whole feature costs cents a day.
The model choice lives on one line in `lib/ai.ts` if that ever stops being true.

**What did you learn from documentation alone?** Answer this yourself once you
have done it. It is the graded one.

**What would you build next?** Store the Google refresh token so the briefing
can run without you present, then send it to you at 7am. That single change is
what turns this from a page you visit into an assistant that reaches you.
