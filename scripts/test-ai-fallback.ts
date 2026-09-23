// Checks lib/ai.ts's fallback rules against fake OpenRouter replies, so it costs
// none of the 50 free requests a day. Run: npx tsx scripts/test-ai-fallback.ts
import assert from "node:assert/strict";
import { complete, MODELS } from "../lib/ai";

process.env.OPENROUTER_API_KEY = "test";
const ok = (model: string) => ({ status: 200, body: { model, choices: [{ message: { role: "assistant", content: "hi" } }] } });
const hidden = (model: string) => ({ status: 200, body: { model, choices: [{ error: { message: "overloaded" }, message: null }] } });

async function run(replies: ({ status: number; body: unknown } | "timeout")[]) {
  const sent: string[][] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).models);
    const r = replies.shift()!;
    if (r === "timeout") throw new Error("The operation was aborted due to timeout");
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  try { return { sent, result: await complete([{ role: "user", content: "x" }], { maxTokens: 10 }) }; }
  catch (e) { return { sent, error: (e as Error).message }; }
}

(async () => {
  assert.ok(MODELS.length <= 3, "OpenRouter rejects a models list longer than 3");

  let r = await run([ok(MODELS[0])]);
  assert.equal(r.sent.length, 1); assert.equal(r.result?.model, MODELS[0]);

  // Model 0 hides an error in a 200: ask again starting after it.
  r = await run([hidden(MODELS[0]), ok(MODELS[1])]);
  assert.deepEqual(r.sent, [MODELS, MODELS.slice(1)]);

  // Model 1 (reached by OpenRouter's own fallback) hides an error: skip to model 2.
  r = await run([hidden(MODELS[1]), ok(MODELS[2])]);
  assert.deepEqual(r.sent, [MODELS, MODELS.slice(2)]);

  // A real error means OpenRouter already tried them all: one request, then stop.
  r = await run([{ status: 429, body: { error: { message: "rate limited" } } }]);
  assert.equal(r.sent.length, 1); assert.match(r.error!, /busy/);

  // A bad key stops at once.
  r = await run([{ status: 401, body: { error: { message: "no auth" } } }]);
  assert.equal(r.sent.length, 1); assert.match(r.error!, /401/);

  // A timeout moves on to the next model.
  r = await run(["timeout", ok(MODELS[1])]);
  assert.deepEqual(r.sent, [MODELS, MODELS.slice(1)]);

  console.log("fallback rules: all 6 checks passed");
})();
