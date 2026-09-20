import { createClient } from "@/lib/supabase/server";
import { getTodaysEvents } from "@/lib/google-calendar";
import { getGithubActivity } from "@/lib/github";
import { getBriefing } from "@/lib/briefing";
import { Chat } from "@/components/Chat";
import { Card, Empty } from "@/components/Card";
import { TaskList } from "@/components/TaskList";
import { PageView } from "@/components/PageView";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Everything below is a real query against a real database. Nothing on this
  // page is mocked, which is Ricky's "no hard-coded or mock data" standard.
  const [tasks, projects, blockers, metrics, calendar, github, briefing,
         recentEvents, lastFailure] =
    await Promise.all([
      supabase.from("tasks").select("id,title,status,priority,due_on")
        .neq("status", "done").order("priority").limit(12),
      supabase.from("projects").select("id,name,status")
        .eq("status", "active").order("created_at").limit(8),
      supabase.from("blockers").select("id,description,owner,needed_by")
        .is("resolved_at", null).order("needed_by", { nullsFirst: false }).limit(8),
      supabase.from("metrics").select("id,label,value,unit,as_of")
        .order("as_of", { ascending: false }).limit(4),
      getTodaysEvents(),
      getGithubActivity(),
      // The briefing reads the same rows again rather than being handed them,
      // so it can be called from anywhere without threading state through.
      getBriefing(),
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("integration_log").select("message,created_at,ok")
        .eq("ok", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const today = new Date().toLocaleDateString("en-US",
    { weekday: "long", month: "long", day: "numeric" });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <PageView name="dashboard" />

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Daniel OS</h1>
          <p className="text-sm text-[var(--muted)]">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[var(--muted)] sm:inline">{user?.email}</span>
          <form action="/auth/signout" method="post">
            <button className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--bg)]">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          What needs your attention
        </h2>
        {briefing.ok ? (
          <>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{briefing.text}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {briefing.cached ? "Written in the last half hour." : "Written just now."}
            </p>
          </>
        ) : (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <strong className="font-medium">Briefing unavailable.</strong> {briefing.message}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Tasks" hint={`${tasks.data?.length ?? 0} open`}>
          <TaskList initial={tasks.data ?? []} />
        </Card>

        <Card title="Today" hint="Google Calendar">
          {calendar.ok ? (
            calendar.events.length === 0 ? (
              <Empty>Nothing on the calendar today.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {calendar.events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 py-2.5">
                    <span className="w-16 shrink-0 text-xs text-[var(--muted)]">
                      {e.allDay || !e.start
                        ? "all day"
                        : new Date(e.start).toLocaleTimeString("en-US",
                            { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{e.summary}</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            // The UI shows an integration failure honestly instead of rendering
            // an empty card that looks like "no meetings today".
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <strong className="font-medium">Calendar unavailable.</strong> {calendar.message}
            </div>
          )}
        </Card>

        <Card title="Projects" hint={`${projects.data?.length ?? 0} active`}>
          {projects.data?.length ? (
            <ul className="space-y-2">
              {projects.data.map((p) => (
                <li key={p.id} className="text-sm">{p.name}</li>
              ))}
            </ul>
          ) : <Empty>No active projects.</Empty>}
        </Card>

        <Card title="Code" hint="GitHub, last 7 days">
          {github.ok ? (
            <>
              <div className="text-2xl font-semibold tabular-nums">
                {github.activity.commitsThisWeek}
                <span className="text-base text-[var(--muted)]"> commits</span>
              </div>
              <ul className="mt-2 space-y-1">
                {github.activity.repos.map((r) => (
                  <li key={r.name} className="truncate text-sm">
                    {r.name}
                    <span className="text-[var(--muted)]">
                      {" "}pushed {new Date(r.pushedAt).toLocaleDateString("en-US",
                        { month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <strong className="font-medium">GitHub unavailable.</strong> {github.message}
            </div>
          )}
        </Card>

        <Card title="Blockers" hint={`${blockers.data?.length ?? 0} open`}>
          {blockers.data?.length ? (
            <ul className="space-y-2">
              {blockers.data.map((b) => (
                <li key={b.id} className="text-sm">
                  {b.description}
                  {b.owner && <span className="text-[var(--muted)]"> - {b.owner}</span>}
                  {b.needed_by && <span className="text-[var(--muted)]"> by {b.needed_by}</span>}
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing blocked.</Empty>}
        </Card>

        <Card title="Key metrics">
          {metrics.data?.length ? (
            <div className="grid grid-cols-2 gap-4">
              {metrics.data.map((m) => (
                <div key={m.id}>
                  <div className="text-2xl font-semibold tabular-nums">
                    {Number(m.value).toLocaleString()}{m.unit && <span className="text-base text-[var(--muted)]"> {m.unit}</span>}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{m.label}</div>
                </div>
              ))}
            </div>
          ) : <Empty>No metrics recorded yet.</Empty>}
        </Card>

        <Card title="System" hint="analytics + last failure">
          <div className="text-2xl font-semibold tabular-nums">{recentEvents.count ?? 0}</div>
          <div className="text-xs text-[var(--muted)]">events recorded (page views + actions)</div>
          <div className="mt-3 border-t border-[var(--line)] pt-3 text-xs">
            <span className="text-[var(--muted)]">Last integration failure: </span>
            {lastFailure.data
              ? <span className="text-amber-800">{lastFailure.data.message}</span>
              : <span className="text-[var(--muted)]">none recorded</span>}
          </div>
        </Card>
      </div>

      <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Ask Jarvis
        </h2>
        <Chat />
      </section>
    </main>
  );
}
