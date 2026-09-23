import { createClient } from "@/lib/supabase/server";
import { getTodaysEvents } from "@/lib/google-calendar";
import { getGithubActivity } from "@/lib/github";
import { aiConfigured, complete, VOICE } from "@/lib/ai";

export type BriefingResult =
  | { ok: true; text: string; cached: boolean }
  | { ok: false; message: string };

// ponytail: one process-wide cache entry, good enough for a single-user app.
// Move it to a `briefings` table if this ever serves more than Daniel.
let cache: { text: string; at: number } | null = null;
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * The "What needs my attention?" briefing. Reads the same live rows the
 * dashboard renders, hands them to the model, and returns a few sentences.
 *
 * Never throws. If the AI is unreachable the dashboard still renders and says
 * why the briefing is missing.
 */
export async function getBriefing(): Promise<BriefingResult> {
  if (cache && Date.now() - cache.at < MAX_AGE_MS) {
    return { ok: true, text: cache.text, cached: true };
  }

  const supabase = await createClient();
  // Same rule as every other integration: a failure lands in integration_log.
  const fail = async (message: string): Promise<BriefingResult> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("integration_log").insert({
      user_id: user.id, provider: "openrouter", ok: false, status: null, message });
    return { ok: false, message };
  };

  if (!aiConfigured()) {
    return fail("No OpenRouter key is configured, so the briefing cannot be written.");
  }
  const [tasks, projects, blockers, metrics, calendar, github] = await Promise.all([
    supabase.from("tasks").select("title,priority,due_on,status").neq("status", "done").order("priority").limit(25),
    supabase.from("projects").select("name,status").eq("status", "active").limit(15),
    supabase.from("blockers").select("description,owner,needed_by").is("resolved_at", null).limit(15),
    supabase.from("metrics").select("label,value,unit,as_of").order("as_of", { ascending: false }).limit(8),
    getTodaysEvents(),
    getGithubActivity(),
  ]);

  const facts = {
    today: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    openTasks: tasks.data ?? [],
    activeProjects: projects.data ?? [],
    openBlockers: blockers.data ?? [],
    metrics: metrics.data ?? [],
    calendar: calendar.ok ? calendar.events : `unavailable: ${calendar.message}`,
    github: github.ok ? github.activity : `unavailable: ${github.message}`,
  };

  try {
    const { message } = await complete([
      { role: "system", content: VOICE },
      {
        role: "user",
        content: `Here is everything my systems know right now, as JSON.\n\n` +
          `${JSON.stringify(facts, null, 2)}\n\n` +
          `Tell me what needs my attention today in four sentences or fewer. Lead with the ` +
          `single most urgent thing. Mention a blocker or an overdue task before anything ` +
          `routine. If a system came back unavailable, say so in half a sentence rather than ` +
          `pretending it is empty. If nothing needs me, say that plainly.`,
      },
    ], { maxTokens: 1000 });

    const text = (message.content ?? "").trim();

    if (!text) return fail("The AI returned an empty briefing.");
    cache = { text, at: Date.now() };
    return { ok: true, text, cached: false };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The briefing request failed.");
  }
}
