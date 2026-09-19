"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Task = { id: string; title: string; status: string; priority: number; due_on: string | null };

export function TaskList({ initial }: { initial: Task[] }) {
  const [tasks, setTasks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function complete(id: string) {
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done", done_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      setTasks((t) => t.filter((x) => x.id !== id));
      // An action, not a page view. Both land in `events`.
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "action", name: "task_completed", path: "/dashboard",
                               meta: { task_id: id } }),
      }).catch(() => {});
    }
    setBusy(null);
  }

  if (tasks.length === 0) {
    return <p className="py-2 text-sm text-[var(--muted)]">Nothing open. Add a row in Supabase to see it here.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5">
          <button
            onClick={() => complete(t.id)}
            disabled={busy === t.id}
            aria-label={`Complete ${t.title}`}
            className="h-5 w-5 shrink-0 rounded-full border-2 border-[var(--line)] transition hover:border-[var(--accent)] disabled:opacity-40"
          />
          <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
          {t.due_on && (
            <span className="shrink-0 text-xs text-[var(--muted)]">{t.due_on}</span>
          )}
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--muted)] ring-1 ring-[var(--line)]">
            P{t.priority}
          </span>
        </li>
      ))}
    </ul>
  );
}
