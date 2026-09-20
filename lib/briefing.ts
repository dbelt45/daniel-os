import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getTodaysEvents } from "@/lib/google-calendar";
import { getGithubActivity } from "@/lib/github";
import { aiClient, MODEL, VOICE } from "@/lib/ai";

export type BriefingResult =
  | { ok: true; text: string; cached: boolean }
  | { ok: false; message: string };

// ponytail: one process-wide cache entry, good enough for a single-user app.
// Move it to a `briefings` table if this ever serves more than Daniel.
let cache: { text: string; at: number } | null = null;
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * The "What needs my attention?" briefing. Reads the same live rows the
 * dashboard renders, hands them to Claude, and returns a few sentences.
 *
 * Never throws. If the AI is unreachable the dashboard still renders and says
 * why the briefing is missing.
 */
export async function getBriefing(): Promise<BriefingResult> {
  if (cache && Date.now() - cache.at < MAX_AGE_MS) {
    return { ok: true, text: cache.text, cached: true };
  }

  const client = aiClient();
  if (!client) {
    return { ok: false, message: "No Anthropic key is configured, so the briefing cannot be written." };
  }

  const supabase = await createClient();
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
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: VOICE,
      messages: [{
        role: "user",
        content: `Here is everything my systems know right now, as JSON.\n\n` +
          `${JSON.stringify(facts, null, 2)}\n\n` +
          `Tell me what needs my attention today in four sentences or fewer. Lead with the ` +
          `single most urgent thing. Mention a blocker or an overdue task before anything ` +
          `routine. If a system came back unavailable, say so in half a sentence rather than ` +
          `pretending it is empty. If nothing needs me, say that plainly.`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("\n").trim();

    if (!text) return { ok: false, message: "The AI returned an empty briefing." };
    cache = { text, at: Date.now() };
    return { ok: true, text, cached: false };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The briefing request failed." };
  }
}
