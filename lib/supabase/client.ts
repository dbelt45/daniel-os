import { createBrowserClient } from "@supabase/ssr";

// Browser client. Uses the ANON key only, which is safe to ship publicly
// because every table has row-level security: the key grants no access on its
// own, it only carries the logged-in user's identity.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
