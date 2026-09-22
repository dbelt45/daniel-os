# Finish Day 2, when you get back

Four steps, about ten minutes, in this order. Everything else is done.

---

## 1. Get the OpenRouter key, paste it in two places (4 min)

Ricky directive 2026-09-22: no Anthropic or OpenAI keys. Every AI call goes
through OpenRouter on a free model (`thinkingmachines/inkling:free`, falling back
to `nvidia/nemotron-3-ultra-550b-a55b:free`).

1. **openrouter.ai**, sign in with your own Google account.
2. Top right menu, **Keys**, then **Create Key**. Name it `daniel-os`, leave the
   credit limit blank. Copy it now, the site never shows it again.
3. **Credits**: use the free starter credits if offered. Do not buy any without
   asking Ricky. The model is free.
4. Open `daniel-os/.env.local` and put it after `OPENROUTER_API_KEY=` on the line
   that is already waiting for it.
5. In **Vercel**, your project, **Settings**, **Environment Variables**, add
   `OPENROUTER_API_KEY` with the same value, for all environments. Delete any
   `ANTHROPIC_API_KEY` there.
6. Run `npm run check`. OpenRouter should say WORKING.

## 2. Make a GitHub token for the live site (3 min)

Your local one comes from the GitHub command line tool and does not travel.

1. **github.com**, your picture, **Settings**, then at the bottom left
   **Developer settings**.
2. **Personal access tokens**, **Fine-grained tokens**, **Generate new token**.
3. Name it `daniel-os`, expiry 90 days, **Repository access: all repositories**,
   and under **Permissions, Repository, Metadata: Read-only**. That is the only
   permission it needs.
4. Copy it, then in **Vercel** add `GITHUB_TOKEN` with that value.

## 3. Fill the three empty cards (2 min)

1. **Supabase**, your project, **SQL Editor**, **New query**.
2. Open `daniel-os/supabase/seed-day2.sql`, **read it and edit the wording** so
   the projects and blockers are your real ones. The briefing treats these rows
   as fact, so a fake row produces a confident wrong briefing.
3. Paste, **Run**.

## 4. Prove it works (1 min)

In the `daniel-os` folder:

```bash
npm run check
```

All three lines should say WORKING. Then open your live Vercel URL on your
phone, sign in, and you should see:

- A briefing at the top written from your own rows
- A Code card showing your commits this week
- A chat box at the bottom. Type **what is overdue?** and then
  **add a task to send Ricky the Day 2 report**

If the briefing says unavailable, the key did not reach Vercel. Vercel needs a
fresh deploy after you add a variable, so hit **Redeploy** on the latest
deployment.

---

## Then the graded one, which is yours alone

The curriculum asks for one integration learned from its documentation alone, no
help. GitHub is already built, so pick a different one and keep it small. Good
candidates, all free and all documented plainly:

- **OpenWeather** current conditions for Austin, one call, no OAuth
- **Google Tasks**, which reuses the Google sign-in you already have
- **Slack** posting the briefing to a channel you own

Whatever you pick, write two or three sentences in the day log about what the
documentation told you and what you got wrong first. That sentence is the
evidence, not the code.

---

## What I already did while you were out

- Built the briefing, the chat, the GitHub card, and the honest-failure behavior
- Tested GitHub against your real account, 4 commits this week, repo `daniel-os`
- Proved the failure path: with no key the chat answers "No OpenRouter key is
  configured, so chat is off" instead of breaking the page
- Added `npm run check`, one command that tells you which systems are live
- Wrote `docs/WALKTHROUGH.md`, the plain-English explanation of every design
  choice, which is what the Day 14 lightning round asks about
- Drafted your day log and your Slack report to Ricky, both in
  `labs/daniel-ai-sprint/logs/`, for you to edit and send
