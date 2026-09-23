import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google redirects here after sign-in with a one-time code. We trade it for a
// session, then persist the Google access token server-side so the calendar
// integration can keep working after this request ends.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`);
  }

  // The Google token only appears on this one response. If it is not captured
  // here it is gone, and the calendar silently stops working after the session
  // is refreshed.
  const session = data.session;
  if (session?.provider_token && session.user) {
    const { error: saveError } = await supabase.from("integration_tokens").upsert({
      user_id: session.user.id,
      provider: "google",
      access_token: session.provider_token,
      refresh_token: session.provider_refresh_token ?? null,
      expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (saveError) {
      await supabase.from("integration_log").insert({ user_id: session.user.id, provider: "google_calendar",
        ok: false, status: null, message: `Could not save the Google token at sign-in: ${saveError.message}` });
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
