"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Calendar read access is requested at sign-in, so one login covers
        // both the auth requirement and the first live integration.
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Daniel OS</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Tasks, projects, blockers, calendar and the numbers that matter. Sign in to continue.
        </p>

        <button
          onClick={signIn}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Opening Google..." : "Sign in with Google"}
        </button>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Sign-in failed: {error}
          </p>
        )}

        <p className="mt-6 text-xs text-[var(--muted)]">
          Uses Google sign-in and asks for read-only calendar access. No password is stored here.
        </p>
      </div>
    </main>
  );
}
