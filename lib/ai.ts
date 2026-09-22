// One place decides which model runs and whether the key exists, so the
// briefing and the chat can never drift apart.
//
// Every AI call goes through OpenRouter (Ricky directive 2026-09-22): no
// Anthropic or OpenAI keys. Inkling is the strongest free model with tool
// calling (Artificial Analysis index 41, Sept 2026). Free models get rate
// limited, so OpenRouter falls through to Nemotron 3 Ultra (38) when it is busy.
export const MODEL = "thinkingmachines/inkling:free";
const FALLBACKS = ["nvidia/nemotron-3-ultra-550b-a55b:free"];

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

/** One chat completion. Returns the assistant message, or throws with OpenRouter's reason. */
export async function complete(messages: Message[], opts: { maxTokens: number; tools?: Tool[] }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "daniel-os",
    },
    body: JSON.stringify({
      models: [MODEL, ...FALLBACKS],
      messages,
      max_tokens: opts.maxTokens,
      ...(opts.tools ? { tools: opts.tools } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? "unknown error"}`);
  }
  const choice = body.choices?.[0];
  if (!choice) throw new Error("OpenRouter returned no answer.");
  return { message: choice.message as Message, finish: choice.finish_reason as string };
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
