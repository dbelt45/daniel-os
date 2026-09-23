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
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id).eq("provider", "google").maybeSingle();

  // Google's access token dies after an hour. The refresh token from sign-in
  // buys a new one, so the calendar keeps working without signing in again.
  // Documented in Google's "Using OAuth 2.0 for Web Server Applications",
  // section "Refreshing an access token".
  const refresh = async (): Promise<string | null> => {
    const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!tok?.refresh_token || !id || !secret) return null;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: id, client_secret: secret,
        refresh_token: tok.refresh_token, grant_type: "refresh_token" }),
      cache: "no-store",
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!json?.access_token) {
      await log(false, res?.status ?? null, `Google refused the refresh: ${json?.error ?? "no response"}.`);
      return null;
    }
    await supabase.from("integration_tokens").update({
      access_token: json.access_token,
      expires_at: new Date(Date.now() + (json.expires_in - 300) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("provider", "google");
    return json.access_token;
  };

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
    let token: string = tok.access_token;
    if (tok.expires_at && new Date(tok.expires_at) < now) token = (await refresh()) ?? token;

    const call = (t: string) => fetch(url, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    let res = await call(token);
    if (res.status === 401) {
      const fresh = await refresh();
      if (fresh) res = await call(fresh);
    }

    if (res.status === 401 || res.status === 403) {
      // Google says why in the body (expired, scope not granted, API not enabled).
      const why = (await res.text()).match(/"message":\s*"([^"]+)"/)?.[1] ?? "no reason given";
      await log(false, res.status, `Google rejected the token: ${why}`);
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
