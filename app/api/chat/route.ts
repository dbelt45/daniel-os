import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTodaysEvents } from "@/lib/google-calendar";
import { getGithubActivity } from "@/lib/github";
import { aiConfigured, complete, VOICE, type Message, type Tool } from "@/lib/ai";

// The model gets these five tools and nothing else. Reads are free; the only two
// writes it can make are adding a task and closing one, and row level security
// still scopes both to the signed-in user.
const defs = [
  {
    name: "list_tasks",
    description: "List Daniel's open tasks, highest priority first. Returns the task id, which is required to complete one.",
    parameters: { type: "object", properties: {}, additionalProperties: false, required: [] },
  },
  {
    name: "add_task",
    description: "Add a new task for Daniel.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the task is, in Daniel's own words." },
        priority: { type: "integer", description: "1 is most important, 3 is least. Default 2." },
        due_on: { type: "string", description: "Due date as YYYY-MM-DD. Omit if he did not give one." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "complete_task",
    description: "Mark one task done. Call list_tasks first to get the id.",
    parameters: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_status",
    description: "Active projects, open blockers and the latest key metrics.",
    parameters: { type: "object", properties: {}, additionalProperties: false, required: [] },
  },
  {
    name: "get_today",
    description: "Today's calendar events and this week's GitHub activity.",
    parameters: { type: "object", properties: {}, additionalProperties: false, required: [] },
  },
];
const tools: Tool[] = defs.map((function_) => ({ type: "function", function: function_ }));

async function runTool(name: string, input: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  switch (name) {
    case "list_tasks": {
      const { data, error } = await supabase.from("tasks")
        .select("id,title,priority,due_on").neq("status", "done").order("priority").limit(50);
      return error ? { error: error.message } : { tasks: data };
    }
    case "add_task": {
      const row = {
        user_id: user.id,
        title: String(input.title ?? "").slice(0, 300),
        priority: Number(input.priority ?? 2),
        due_on: input.due_on ? String(input.due_on) : null,
      };
      if (!row.title) return { error: "A task needs a title." };
      const { data, error } = await supabase.from("tasks").insert(row).select("id,title").single();
      if (!error) await track(supabase, user.id, "chat_task_added", { title: row.title });
      return error ? { error: error.message } : { added: data };
    }
    case "complete_task": {
      const id = String(input.task_id ?? "");
      const { data, error } = await supabase.from("tasks")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("id", id).select("id,title").single();
      if (!error) await track(supabase, user.id, "chat_task_completed", { task_id: id });
      return error ? { error: error.message } : { completed: data };
    }
    case "get_status": {
      const [projects, blockers, metrics] = await Promise.all([
        supabase.from("projects").select("name,status").eq("status", "active").limit(20),
        supabase.from("blockers").select("description,owner,needed_by").is("resolved_at", null).limit(20),
        supabase.from("metrics").select("label,value,unit,as_of").order("as_of", { ascending: false }).limit(8),
      ]);
      return { projects: projects.data, blockers: blockers.data, metrics: metrics.data };
    }
    case "get_today": {
      const [calendar, github] = await Promise.all([getTodaysEvents(), getGithubActivity()]);
      return {
        calendar: calendar.ok ? calendar.events : `unavailable: ${calendar.message}`,
        github: github.ok ? github.activity : `unavailable: ${github.message}`,
      };
    }
    default:
      return { error: `No tool named ${name}.` };
  }
}

async function track(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string, name: string, meta: Record<string, unknown>
) {
  await supabase.from("events").insert({
    user_id: userId, kind: "action", name, path: "/api/chat", meta,
  });
}

export async function POST(request: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { ok: false, message: "No OpenRouter key is configured, so chat is off." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });

  let history: Message[];
  try {
    const body = await request.json();
    // Only plain user and assistant text comes from the browser.
    history = Array.isArray(body?.messages)
      ? body.messages.slice(-20)
          .filter((m: Message) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m: Message) => ({ role: m.role, content: m.content }))
      : [];
  } catch {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }
  if (history.length === 0) {
    return NextResponse.json({ ok: false, message: "Nothing to answer." }, { status: 400 });
  }

  const messages: Message[] = [{ role: "system", content: VOICE }, ...history];
  try {
    // Manual tool loop. Five rounds covers "what is overdue, close the first one".
    for (let round = 0; round < 5; round++) {
      const { message } = await complete(messages, { maxTokens: 2000, tools });
      const calls = message.tool_calls ?? [];

      if (calls.length === 0) {
        const text = (message.content ?? "").trim();
        return NextResponse.json({ ok: true, reply: text || "I have nothing to add." });
      }

      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
      const results = await Promise.all(calls.map(async (call) => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(call.function.arguments || "{}"); } catch { /* bad JSON, run with no input */ }
        return {
          role: "tool" as const,
          tool_call_id: call.id,
          content: JSON.stringify(await runTool(call.function.name, input)),
        };
      }));
      messages.push(...results);
    }
    return NextResponse.json({ ok: true,
      reply: "That took more steps than I allow in one go. Ask me a narrower question." });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "The chat request failed." },
      { status: 502 });
  }
}
