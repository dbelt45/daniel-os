#!/usr/bin/env node
// One command that tells you which outside systems are actually working.
// Run it with: npm run check
//
// It reads .env.local the same way Next.js does, calls each system once, and
// prints a plain answer. It never prints a key.

import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const results = [];
const add = (name, ok, detail) => results.push({ name, ok, detail });

// ---------------------------------------------------------------- Supabase
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  add("Supabase", false, "URL or key missing from .env.local");
} else {
  try {
    const res = await fetch(`${url}/rest/v1/tasks?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    const body = await res.json();
    // No signed-in user means row level security returns an empty list. An
    // empty list here is the CORRECT answer and proves RLS is on.
    if (res.ok && Array.isArray(body) && body.length === 0) {
      add("Supabase", true, "reachable, and row level security returned zero rows to an anonymous caller, which is right");
    } else if (res.ok) {
      add("Supabase", false, `reachable, but an anonymous caller got ${body.length} rows back. Check the policies`);
    } else {
      add("Supabase", false, `returned ${res.status}: ${body.message ?? "unknown error"}`);
    }
  } catch (e) {
    add("Supabase", false, e.message);
  }
}

// ------------------------------------------------------------------ GitHub
const gh = process.env.GITHUB_TOKEN;
if (!gh) {
  add("GitHub", false, "no GITHUB_TOKEN set, so the Code card will say it is not connected");
} else {
  const headers = {
    Authorization: `Bearer ${gh}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "daniel-os",
  };
  try {
    const me = await fetch("https://api.github.com/user", { headers });
    if (!me.ok) {
      add("GitHub", false, `token rejected with ${me.status}`);
    } else {
      const login = (await me.json()).login;
      const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const search = await fetch(
        `https://api.github.com/search/commits?q=${encodeURIComponent(`author:${login} author-date:>=${since}`)}&per_page=1`,
        { headers });
      const count = search.ok ? (await search.json()).total_count : "unknown";
      add("GitHub", true, `signed in as ${login}, ${count} commits in the last 7 days`);
    }
  } catch (e) {
    add("GitHub", false, e.message);
  }
}

// --------------------------------------------------------------- Anthropic
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  add("Anthropic", false, "no ANTHROPIC_API_KEY set, so the briefing and the chat are off");
} else {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the word ready." }],
      }),
    });
    const body = await res.json();
    if (res.ok) {
      const said = body.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
      add("Anthropic", true, `answered "${said}" using ${body.model}`);
    } else {
      add("Anthropic", false, `${res.status}: ${body.error?.message ?? "unknown error"}`);
    }
  } catch (e) {
    add("Anthropic", false, e.message);
  }
}

// ------------------------------------------------------------------ report
console.log("");
for (const r of results) {
  console.log(`${r.ok ? "WORKING" : "NOT YET"}  ${r.name.padEnd(10)} ${r.detail}`);
}
const broken = results.filter((r) => !r.ok);
console.log("");
console.log(broken.length === 0
  ? "Everything is connected."
  : `${broken.length} of ${results.length} still need something: ${broken.map((b) => b.name).join(", ")}.`);
process.exit(broken.length === 0 ? 0 : 1);
