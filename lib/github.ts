import { createClient } from "@/lib/supabase/server";

export type GithubActivity = {
  commitsThisWeek: number;
  repos: { name: string; pushedAt: string }[];
};

export type GithubResult =
  | { ok: true; activity: GithubActivity }
  | { ok: false; reason: "not_connected" | "bad_token" | "api_error"; message: string };

const API = "https://api.github.com";

/**
 * Read the signed-in developer's own recent GitHub activity.
 *
 * Learned from GitHub's REST reference (repos/list-for-authenticated-user and
 * search/commits): `sort=pushed` orders repos by last push, and commit search
 * needs `author:<login>` plus `author-date:>=<ISO date>` to scope a window.
 * Search requires the `Accept: application/vnd.github.cloak-preview` style
 * header on older versions, so the current `X-GitHub-Api-Version` is sent
 * instead and the response is read defensively.
 *
 * Never throws. A dead integration degrades one card, per the Day 1 standard.
 */
export async function getGithubActivity(): Promise<GithubResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, reason: "not_connected", message: "No GitHub token is configured." };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "daniel-os",
  };

  try {
    const me = await fetch(`${API}/user`, { headers, cache: "no-store" });
    if (me.status === 401) {
      await log(false, 401, "GitHub rejected the token. It is missing or expired.");
      return { ok: false, reason: "bad_token", message: "GitHub rejected the token." };
    }
    if (!me.ok) {
      await log(false, me.status, `GitHub /user returned ${me.status}.`);
      return { ok: false, reason: "api_error", message: `GitHub returned ${me.status}.` };
    }
    const login: string = (await me.json()).login;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [reposRes, commitsRes] = await Promise.all([
      fetch(`${API}/user/repos?sort=pushed&per_page=5&affiliation=owner`, { headers, cache: "no-store" }),
      fetch(`${API}/search/commits?q=${encodeURIComponent(`author:${login} author-date:>=${since}`)}&per_page=1`,
            { headers, cache: "no-store" }),
    ]);

    if (!reposRes.ok) {
      await log(false, reposRes.status, `GitHub repo list returned ${reposRes.status}.`);
      return { ok: false, reason: "api_error", message: `GitHub returned ${reposRes.status}.` };
    }

    const repos = (await reposRes.json()).map((r: { name: string; pushed_at: string }) => ({
      name: r.name, pushedAt: r.pushed_at,
    }));
    // Commit search is rate limited harder than the rest of the API, so a
    // failure here costs the count, not the card.
    const commitsThisWeek = commitsRes.ok ? Number((await commitsRes.json()).total_count ?? 0) : 0;

    await log(true, 200, `${commitsThisWeek} commits in the last 7 days.`);
    return { ok: true, activity: { commitsThisWeek, repos } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "GitHub request failed.";
    await log(false, null, message);
    return { ok: false, reason: "api_error", message };
  }
}

async function log(ok: boolean, status: number | null, message: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("integration_log").insert({
      user_id: user.id, provider: "github", ok, status, message,
    });
  } catch {
    // Logging a failure must never become the failure.
  }
}
