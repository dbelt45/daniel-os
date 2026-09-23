// One place decides which model runs and whether the key exists, so the
// briefing and the chat can never drift apart.
//
// Every AI call goes through OpenRouter (Ricky directive 2026-09-22): no
// Anthropic or OpenAI keys, free models only. Two layers of fallback:
// 1. OpenRouter's own `models` list fails over inside one request, which covers
//    ordinary errors (rate limits, a model that is down) at no extra cost.
// 2. Sometimes a provider reports "overloaded" inside a normal 200 reply, where
//    OpenRouter's failover never fires. We check every reply for that and, if
//    found, ask again starting from the next model in the list.
// Inkling scores higher but OpenRouter only serves it free to coding agents.
// Every model here can call tools. "openrouter/free" is deliberately NOT here:
// it picked tiny models that answered "I don't have access to your tasks",
// and a wrong answer is worse than an honest "busy, try again".
export const MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free", // strongest free model that serves apps
  "nvidia/nemotron-3-super-120b-a12b:free", // same family
  "google/gemma-4-31b-it:free",             // different company, so a different queue
];
// OpenRouter rejects a `models` list longer than 3, so keep this at 3.

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Tool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** One chat completion. Tries each model in turn; throws only when all of them fail. */
export async function complete(messages: Message[], opts: { maxTokens: number; tools?: Tool[] }) {
  const failures: string[] = [];
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim()}`,
          "Content-Type": "application/json",
          "X-Title": "daniel-os",
        },
        body: JSON.stringify({
          models: MODELS.slice(i),
          messages,
          // Let the model think (turning it off made it skip tools), but keep the
          // thinking out of the reply so "Okay, the user asked..." never shows.
          reasoning: { exclude: true },
          // Without this OpenRouter may route to a provider that silently drops
          // `tools`, and the model then invents tool calls as plain text.
          provider: { require_parameters: true },
          max_tokens: opts.maxTokens,
          ...(opts.tools ? { tools: opts.tools } : {}),
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const body = await res.json().catch(() => ({}));
      const choice = body.choices?.[0];
      const error = body.error?.message ?? choice?.error?.message;
      if (!res.ok) {
        // A bad key fails every model the same way, so stop and say so.
        if (res.status === 401) throw new Error("OpenRouter rejected the key (401).");
        // Otherwise OpenRouter already tried every model left in the list.
        // Retrying would only burn more of the 50 free requests a day.
        failures.push(`${model}: ${error ?? `HTTP ${res.status}`}`);
        break;
      }
      if (error || !choice?.message) {
        // A "success" hiding an error. Skip past whichever model sent it.
        failures.push(`${body.model ?? model}: ${error ?? "empty reply"}`);
        i = Math.max(i, MODELS.indexOf(body.model));
        continue;
      }
      return { message: choice.message as Message, finish: choice.finish_reason as string, model: String(body.model ?? model) };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("OpenRouter rejected")) throw e;
      failures.push(`${model}: ${e instanceof Error ? e.message : "request failed"}`);
    }
  }
  throw new Error(`Every free model is busy right now. ${failures.join(" | ")}`);
}

export const VOICE = `You are Jarvis, Daniel Belt's assistant. Daniel is Director of
Operations at Turnkey Services. He is not a developer.

How you write:
- Answer first. No preamble, no recap of what you looked at.
- Plain English. Full sentences, the way you would say them out loud.
- Never a bare label followed by a colon, and never a wall of text.
- Never use an em dash or an en dash. Use a spaced hyphen or a period.
- Two or three sentences is usually right. Stop when the answer is done.
- If you do not know, say so and name the one thing that would answer it.
- Never invent a task, a meeting or a number. Only use what the data shows.`;
