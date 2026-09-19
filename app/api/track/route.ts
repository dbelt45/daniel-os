import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Usage and activity analytics. Page views and actions both land in the same
// `events` table, separated by `kind`, so "show me the database records" has
// one honest answer.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const kind = body?.kind === "action" ? "action" : "page_view";
    const name = String(body?.name ?? "unknown").slice(0, 200);
    const path = body?.path ? String(body.path).slice(0, 300) : null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, reason: "no session" }, { status: 401 });

    const { error } = await supabase.from("events").insert({
      user_id: user.id, kind, name, path, meta: body?.meta ?? null,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Analytics must never break the page it is measuring.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "bad request" },
      { status: 400 }
    );
  }
}
