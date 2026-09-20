"use client";

import { useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setFailure(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = await res.json();
      if (body.ok) {
        setTurns([...next, { role: "assistant", content: body.reply }]);
      } else {
        // An honest failure, shown where it happened, per the Day 1 standard.
        setFailure(body.message ?? `Chat returned ${res.status}.`);
      }
    } catch {
      setFailure("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  return (
    <div>
      {turns.length === 0 && !failure && (
        <p className="pb-3 text-sm text-[var(--muted)]">
          Ask me what is overdue, what today looks like, or tell me to add a task.
        </p>
      )}

      <div className="max-h-80 space-y-3 overflow-y-auto">
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
              t.role === "user"
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg)] ring-1 ring-[var(--line)]"
            }`}>
              {t.content}
            </span>
          </div>
        ))}
        {busy && <p className="text-sm text-[var(--muted)]">Thinking...</p>}
        {failure && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <strong className="font-medium">Chat unavailable.</strong> {failure}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Jarvis"
          aria-label="Ask Jarvis"
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
