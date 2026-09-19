import { createClient } from "@/lib/supabase/server";

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string | null;
  allDay: boolean;
};

export type CalendarResult =
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; reason: "not_connected" | "expired" | "api_error" | "no_session"; message: string };

/**
 * Read today's events from Google Calendar.
 *
 * Learned from Google's Calendar API v3 reference (events.list): timeMin and
 * timeMax must be RFC3339, singleEvents=true is required for orderBy=startTime,
 * otherwise recurring events come back as un-expanded master records.
 *
 * Every outcome is logged to `integration_log`, including failures, because
 * Ricky's Day 1 standard says logs must show the last failure honestly. This
 * function NEVER throws: a dead integration degrades the calendar card, it does
 * not take down the dashboard.
 */
export async function getTodaysEvents(): Promise<CalendarResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no_session", message: "Not signed in." };

  const log = async (ok: boolean, status: number | null, message: string) => {
    await supabase.from("integration_log").insert({
      user_id: user.id, provider: "google_calendar", ok, status, message,
    });
  };

  const { data: tok } = await supabase
    .from("integration_tokens")
    .select("access_token, expires_at")
    .eq("user_id", user.id).eq("provider", "google").maybeSingle();

  if (!tok?.access_token) {
    await log(false, null, "No Google token stored. Sign out and sign in again to grant calendar access.");
    return { ok: false, reason: "not_connected",
             message: "Calendar not connected. Sign out and back in to grant access." };
  }

  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", start.toISOString());
  url.searchParams.set("timeMax", end.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "20");

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      await log(false, res.status, "Google rejected the token (expired or access revoked).");
      return { ok: false, reason: "expired",
               message: "Google access expired. Sign out and back in to reconnect." };
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      await log(false, res.status, `Calendar API returned ${res.status}: ${body}`);
      return { ok: false, reason: "api_error", message: `Calendar API error ${res.status}.` };
    }

    const json = await res.json();
    const events: CalendarEvent[] = (json.items ?? []).map((e: Record<string, any>) => ({
      id: String(e.id),
      summary: e.summary ?? "(no title)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      allDay: !e.start?.dateTime,
    }));
    await log(true, 200, `Fetched ${events.length} event(s).`);
    return { ok: true, events };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown network error";
    await log(false, null, `Network failure calling Google: ${message}`);
    return { ok: false, reason: "api_error", message: "Could not reach Google Calendar." };
  }
}
