"use client";

import { useEffect, useState } from "react";
import { phaseLabel } from "@/lib/types";
import { Brand, Button, Dialog, Icon, IconButton, Snackbar, TextField, api, fmtClock, remainingMs, useTick } from "@/components/ui";
import { useLive } from "@/components/live";

type Tab = "control" | "teams" | "queue" | "desk" | "grading" | "setup" | "exports";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { data, error, reload } = useLive<any>("/api/admin/overview", 3000);
  useEffect(() => {
    if (data) setAuthed(true);
    else if (error?.status === 401) setAuthed(false);
  }, [data, error]);
  if (authed === false) return <AdminLogin />;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-app"><Icon name="progress_activity" className="animate-spin text-primary" size={40} /></div>;
  return <Console data={data} reload={reload} />;
}

function AdminLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-tint p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/auth/admin", { method: "POST", json: { password: pw } });
            location.reload();
          } catch (x: any) {
            setErr(x.message);
          }
        }}
        className="w-full max-w-md rounded-[28px] bg-white p-10"
      >
        <Brand />
        <h1 className="mt-8 font-display text-[32px]">Admin console</h1>
        <p className="mt-2 text-sm text-ink2">Event control for organisers.</p>
        <TextField className="mt-8" label="Admin password" type="password" value={pw} onChange={setPw} autoFocus />
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-8 flex justify-end">
          <Button type="submit">Sign in</Button>
        </div>
      </form>
    </main>
  );
}

function useAction(reload: () => void, toast: (m: string) => void) {
  return async (action: string, payload: Record<string, unknown> = {}, ok?: string) => {
    try {
      const r = await api("/api/admin/action", { method: "POST", json: { action, ...payload } });
      if (ok) toast(ok);
      reload();
      return r;
    } catch (e: any) {
      toast(e.message);
      throw e;
    }
  };
}

function Console({ data, reload }: { data: any; reload: () => void }) {
  const [tab, setTab] = useState<Tab>("control");
  const [toast, setToast] = useState<string | null>(null);
  const act = useAction(reload, setToast);
  const e = data.event;
  const now = useTick(500);
  const rem = remainingMs({ phaseEndsAt: e.phase_ends_at, paused: e.paused, pausedRemainingMs: e.paused_remaining_ms }, now);

  const tabs: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: "control", icon: "tune", label: "Event control" },
    { id: "teams", icon: "groups", label: "Live teams" },
    { id: "queue", icon: "record_voice_over", label: "Vishal queue", badge: data.queue.filter((q: any) => q.status === "waiting").length },
    { id: "desk", icon: "support_agent", label: "Accounts desk", badge: data.cfo.filter((q: any) => now - Date.parse(q.created_at) < 60_000 && !q.overridden_by_admin).length },
    { id: "grading", icon: "grading", label: "Grading & results" },
    { id: "setup", icon: "settings", label: "Setup" },
    { id: "exports", icon: "download", label: "Exports" },
  ];

  return (
    <div className="flex h-screen flex-col bg-app">
      <header className="flex h-16 shrink-0 items-center gap-4 px-4">
        <div className="w-[232px] pl-2">
          <Brand />
        </div>
        <span className="rounded-full bg-[#E8DEF8] px-3 py-1 text-xs font-medium text-[#4A4458]">Admin</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex h-10 items-center gap-3 rounded-full bg-white px-4 shadow-e1">
            <span className="text-sm font-medium">{phaseLabel(e.phase)}</span>
            {rem !== null && <span className="font-mono text-lg tabular-nums">{e.paused && "⏸ "}{fmtClock(rem)}</span>}
          </div>
          <a href="/display" target="_blank" className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-primary hover:bg-[#0B57D014]">
            <Icon name="cast" size={18} /> Projector
          </a>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-[256px] shrink-0 space-y-0.5 px-3">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex h-9 w-full items-center gap-4 rounded-full pl-4 pr-3 text-sm ${tab === t.id ? "bg-selected font-medium text-[#001D35]" : "hover:bg-hover"}`}>
              <Icon name={t.icon} size={20} fill={tab === t.id} />
              <span className="flex-1 text-left">{t.label}</span>
              {!!t.badge && <span className="rounded-full bg-primary px-2 text-xs text-white">{t.badge}</span>}
            </button>
          ))}
          <div className="px-4 pt-8 text-xs leading-5 text-ink2">
            {data.teams.filter((t: any) => t.online).length} of {data.teams.length} teams online
          </div>
        </nav>
        <main className="scroll-thin mb-4 mr-4 flex-1 overflow-auto rounded-2xl bg-white p-6">
          {tab === "control" && <Control e={e} data={data} act={act} rem={rem} />}
          {tab === "teams" && <Teams data={data} act={act} />}
          {tab === "queue" && <QueuePanel data={data} act={act} now={now} />}
          {tab === "desk" && <DeskPanel data={data} act={act} now={now} />}
          {tab === "grading" && <Grading data={data} act={act} toast={setToast} />}
          {tab === "setup" && <Setup e={e} data={data} act={act} />}
          {tab === "exports" && <Exports />}
        </main>
      </div>
      <Snackbar message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

type Act = ReturnType<typeof useAction>;

function H({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-2xl text-ink">{children}</h2>
      {sub && <p className="mt-1 text-sm text-ink2">{sub}</p>}
    </div>
  );
}

function Confirm({ label, icon, onYes, variant = "tonal", disabled, detail }: { label: string; icon: string; onYes: () => Promise<unknown>; variant?: any; disabled?: boolean; detail?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        <Icon name={icon} size={18} /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`${label}?`} width={460}>
        <p className="text-sm text-ink2">{detail ?? "This updates every team screen and the projector straight away."}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="text" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onYes();
                setOpen(false);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm
          </Button>
        </div>
      </Dialog>
    </>
  );
}

const STEPS: { at: string; label: string; icon: string; run: (act: Act) => Promise<unknown>; done: (e: any) => boolean; detail: string }[] = [
  { at: "0:00", label: "Open briefing", icon: "play_circle", run: (a) => a("phase", { phase: "briefing" }), done: (e) => e.phase !== "lobby", detail: "Teams see only the Read Me folder. 10-minute countdown." },
  { at: "0:10", label: "Start audit", icon: "folder_open", run: (a) => a("phase", { phase: "audit" }), done: (e) => !["lobby", "briefing"].includes(e.phase), detail: "All folders unlock, the 55-minute timer starts, the findings table opens and Vishal's queue opens." },
  { at: "0:35", label: "Push Inject 1", icon: "mark_email_unread", run: (a) => a("inject1"), done: (e) => !!e.inject1_at, detail: "The whistleblower email lands in every team's Inbox with a banner and sound." },
  { at: "1:05", label: "Open report", icon: "assignment", run: (a) => a("phase", { phase: "report" }), done: (e) => !["lobby", "briefing", "audit"].includes(e.phase), detail: "Closes the Accounts desk, unlocks the full report, starts the 15-minute timer." },
  { at: "1:20", label: "Close submissions", icon: "lock", run: (a) => a("close_submissions"), done: (e) => ["closed", "pitches", "reveal", "results"].includes(e.phase), detail: "Locks reports and the Drive. Unsubmitted drafts are submitted automatically. (Also happens by itself when the report timer ends.)" },
  { at: "1:20", label: "Start pitches", icon: "co_present", run: (a) => a("phase", { phase: "pitches" }), done: (e) => ["pitches", "reveal", "results"].includes(e.phase), detail: "Projector switches to the pitch order and timer." },
  { at: "1:45", label: "Reveal answers", icon: "visibility", run: (a) => a("phase", { phase: "reveal" }), done: (e) => ["reveal", "results"].includes(e.phase), detail: "Projector shows the answer key summary." },
  { at: "1:55", label: "Show results", icon: "emoji_events", run: (a) => a("phase", { phase: "results" }), done: (e) => e.phase === "results", detail: "Projector shows the leaderboard (publish it in Grading first)." },
];

function Control({ e, data, act, rem }: { e: any; data: any; act: Act; rem: number | null }) {
  const [msg, setMsg] = useState(e.announcement ?? "");
  const nextIdx = STEPS.findIndex((s) => !s.done(e));
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-6 rounded-2xl bg-tint p-6">
        <div>
          <div className="text-sm text-ink2">Current phase</div>
          <div className="font-display text-4xl">{phaseLabel(e.phase)}</div>
        </div>
        <div className="font-mono text-6xl tabular-nums">{rem !== null ? fmtClock(rem) : "—"}</div>
        <div className="ml-auto flex gap-2">
          {e.paused ? (
            <Button onClick={() => act("resume", {}, "Resumed")}>
              <Icon name="play_arrow" size={18} /> Resume
            </Button>
          ) : (
            <Button variant="outlined" disabled={!e.phase_ends_at} onClick={() => act("pause", {}, "Paused")}>
              <Icon name="pause" size={18} /> Pause
            </Button>
          )}
          <Button variant="outlined" disabled={!e.phase_ends_at && !e.paused} onClick={() => act("extend", { minutes: 5 }, "Extended by 5 minutes")}>
            <Icon name="more_time" size={18} /> +5 min
          </Button>
        </div>
      </div>

      <div>
        <H sub="Each button asks for confirmation. Times are minutes from the start of the event.">Run of show</H>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {STEPS.map((s, i) => {
            const done = s.done(e);
            return (
              <div key={s.label} className={`flex items-center gap-4 px-5 py-3 ${i === nextIdx ? "bg-[#EDF2FA]" : ""}`}>
                <span className="w-12 font-mono text-sm text-ink2">{s.at}</span>
                <Icon name={done ? "check_circle" : s.icon} fill={done} className={done ? "text-success" : "text-ink2"} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-ink2">{s.detail}</div>
                </div>
                <Confirm label={s.label} icon={s.icon} variant={i === nextIdx ? "filled" : "outlined"} onYes={() => s.run(act)} detail={s.detail} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Toggle
          title="Vishal's queue"
          hint="Opens automatically when the audit starts. Turn it off to pause requests; it closes with submissions."
          on={e.queue_open}
          onChange={(v) => act("toggle", { key: "queue_open", value: v }, v ? "Queue opened" : "Queue closed")}
        />
        <Toggle title="Accounts desk (CFO questions)" hint="Open at 0:20, close at 1:00." on={e.cfo_open} onChange={(v) => act("toggle", { key: "cfo_open", value: v }, v ? "Desk opened" : "Desk closed")} />
      </div>

      <div>
        <H sub="Shows on the projector and at the top of every team screen.">Announcement</H>
        <div className="flex gap-2">
          <input value={msg} onChange={(x) => setMsg(x.target.value)} maxLength={200} placeholder="e.g. 10 minutes left in the audit" className="h-10 flex-1 rounded-full border border-outline px-4 text-sm outline-none focus:border-primary" />
          <Button onClick={() => act("announce", { text: msg }, "Announcement sent")}>Send</Button>
          <Button variant="text" onClick={() => { setMsg(""); act("announce", { text: "" }, "Cleared"); }}>Clear</Button>
        </div>
      </div>

      {e.phase === "pitches" && <PitchControl e={e} data={data} act={act} />}

      <div className="rounded-2xl bg-[#FEF7E0] p-5 text-sm leading-6 text-[#5C3B00]">
        <div className="mb-1 flex items-center gap-2 font-medium">
          <Icon name="info" size={18} /> Limits of the anti-copy controls
        </div>
        The app makes copying slow and visible; it cannot make it impossible. Screenshots and phone cameras cannot be blocked by a browser, and a determined student with
        DevTools can reach the page images. Every page carries a watermark with the team name, code and time, so a leaked image is traceable. The event rules carry the
        rest: phones in bags, one laptop per team, no AI tools.
      </div>
    </div>
  );
}

function Toggle({ title, hint, on, onChange }: { title: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line p-5">
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-ink2">{hint}</div>
      </div>
      <button onClick={() => onChange(!on)} className={`relative h-8 w-14 rounded-full transition ${on ? "bg-primary" : "bg-[#E1E3E1] ring-2 ring-inset ring-[#747775]"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full transition-all ${on ? "left-7 bg-white" : "left-1 bg-[#747775]"}`} />
      </button>
      <span className={`w-14 text-sm font-medium ${on ? "text-primary" : "text-ink2"}`}>{on ? "Open" : "Closed"}</span>
    </div>
  );
}

function PitchControl({ e, data, act }: { e: any; data: any; act: Act }) {
  const now = useTick(250);
  const names = new Map(data.teams.map((t: any) => [t.id, t]));
  const cur: any = names.get(e.pitch_order[e.pitch_index]);
  const ms = e.pitch_ends_at ? Date.parse(e.pitch_ends_at) - now : null;
  return (
    <div className="rounded-2xl border border-line p-6">
      <H sub="2 minutes per team. The projector timer turns red at 15 seconds.">Pitches</H>
      <div className="mb-4 flex gap-2">
        <Button variant="outlined" onClick={() => act("pitch_order", { mode: "table" }, "Order set by table")}>Order by table</Button>
        <Button variant="outlined" onClick={() => act("pitch_order", { mode: "random" }, "Order shuffled")}>Random order</Button>
      </div>
      {e.pitch_order.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[220px]">
            <div className="text-sm text-ink2">
              Now ({e.pitch_index + 1}/{e.pitch_order.length})
            </div>
            <div className="font-display text-3xl">{cur?.name ?? "—"}</div>
          </div>
          <div className={`font-mono text-5xl tabular-nums ${ms !== null && ms <= 15_000 ? "text-danger" : ""}`}>{fmtClock(ms ?? 120_000)}</div>
          <div className="ml-auto flex gap-2">
            <IconButton icon="skip_previous" title="Previous team" onClick={() => act("pitch_prev")} />
            {e.pitch_ends_at ? <Button variant="outlined" onClick={() => act("pitch_stop")}>Stop timer</Button> : <Button onClick={() => act("pitch_start", { seconds: 120 })}><Icon name="timer" size={18} /> Start 2:00</Button>}
            <IconButton icon="skip_next" title="Next team" onClick={() => act("pitch_next")} />
          </div>
        </div>
      )}
    </div>
  );
}

const reportBadge = (r: any) => {
  if (!r) return <span className="text-ink2">Not started</span>;
  if (r.status === "submitted") return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${r.auto_submitted ? "bg-[#FEF7E0] text-[#7A4F01]" : "bg-[#C4EED0] text-[#0D652D]"}`}>{r.auto_submitted ? "Auto-submitted" : "Submitted"}</span>;
  return <span className="rounded-md bg-tint px-2 py-0.5 text-xs text-ink2">Drafting</span>;
};

function Teams({ data, act }: { data: any; act: Act }) {
  const [open, setOpen] = useState<any>(null);
  return (
    <div>
      <H sub="Click a row for that team's activity log.">Live teams</H>
      <table className="w-full text-sm">
        <thead>
          <tr className="h-10 border-b border-line text-left text-xs text-ink2">
            <th className="pl-2 font-medium">Team</th>
            <th className="font-medium">Table</th>
            <th className="font-medium">Files</th>
            <th className="font-medium">Notes</th>
            <th className="font-medium">Vishal</th>
            <th className="font-medium">CFO Qs</th>
            <th className="font-medium">Blocked</th>
            <th className="font-medium">2nd logins</th>
            <th className="font-medium">Report</th>
          </tr>
        </thead>
        <tbody>
          {data.teams.map((t: any) => {
            return (
              <tr key={t.id} onClick={() => setOpen(t)} className="h-11 cursor-pointer border-b border-line hover:bg-hover">
                <td className="pl-2">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${t.online ? "bg-[#1E8E3E]" : "bg-outline"}`} title={t.online ? "Online" : "Offline"} />
                    <span className="font-medium">{t.name}</span>
                  </span>
                </td>
                <td>{t.table_no ?? "—"}</td>
                <td>{t.stats?.files_opened ?? 0}</td>
                <td>{t.stats?.notes ?? 0}</td>
                <td>
                  {t.vishal_used}/{t.vishal_limit}
                </td>
                <td>{t.cfo_used}/2</td>
                <td>{t.stats?.blocked ?? 0}</td>
                <td className={(t.stats?.second_logins ?? 0) > 0 ? "font-bold text-danger" : ""}>{t.stats?.second_logins ?? 0}</td>
                <td>{reportBadge(t.report)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.teams.length === 0 && <p className="py-10 text-center text-ink2">No teams yet. Create them in Setup.</p>}
      <ActivityDialog team={open} onClose={() => setOpen(null)} act={act} />
    </div>
  );
}

function ActivityDialog({ team, onClose, act }: { team: any; onClose: () => void; act: Act }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    if (!team) return;
    setRows(null);
    api(`/api/admin/activity?team=${team.id}`).then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, [team]);
  if (!team) return null;
  return (
    <Dialog open={!!team} onClose={onClose} title={`${team.name} · table ${team.table_no ?? "—"}`} width={760}>
      <div className="mb-3 text-sm text-ink2">
        {team.members?.join(", ") || "No members yet"} · code <span className="font-mono">{team.code}</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outlined" onClick={() => act("add_session", { teamId: team.id }, "Added a Vishal session")}>+1 Vishal session</Button>
        <Button variant="outlined" onClick={() => act("force_logout", { teamId: team.id }, "Signed out")}>Sign out device</Button>
        <Button variant="outlined" onClick={() => act("reset_code", { teamId: team.id }, "New code issued")}>Reset code</Button>
      </div>
      <div className="scroll-thin max-h-[50vh] overflow-auto rounded-xl border border-line">
        {!rows ? (
          <p className="p-4 text-sm text-ink2">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-ink2">No activity yet.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="w-24 px-3 py-1.5 font-mono text-ink2">{new Date(r.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td className={`px-2 ${["second_login", "devtools"].includes(r.event_type) ? "font-medium text-danger" : ""}`}>{r.event_type.replace("_", " ")}</td>
                  <td className="px-2 font-mono">{r.doc_id ?? ""}</td>
                  <td className="px-2 text-ink2">{r.detail ? (r.detail.ms ? `${Math.round(r.detail.ms / 1000)}s` : r.detail.key ?? "") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}

function QueuePanel({ data, act, now }: { data: any; act: Act; now: number }) {
  const cur = data.queue.find((q: any) => q.status === "in_session");
  const waiting = data.queue.filter((q: any) => q.status === "waiting");
  const [note, setNote] = useState("");
  const ms = cur ? Date.parse(cur.ends_at) - now : 0;
  return (
    <div className="space-y-6">
      <H sub={`Press Start as Vishal sits with a team. At 0:00 the projector shows "Time up" and the next table. Average session: ${data.avgSessionSec ? fmtClock(data.avgSessionSec * 1000) : "—"}.`}>Vishal queue</H>
      {cur ? (
        <div className="rounded-2xl bg-[#0842A0] p-6 text-white">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div className="text-sm text-[#D3E3FD]">In session</div>
              <div className="font-display text-4xl">
                Table {cur.table_no} · {cur.team_name}
              </div>
              <div className="mt-3 rounded-xl bg-white/10 p-3 text-[15px]">{cur.question}</div>
              {cur.doc_ids?.length > 0 && <div className="mt-2 font-mono text-xs text-[#D3E3FD]">{cur.doc_ids.join(" · ")}</div>}
            </div>
            <div className={`font-mono text-6xl tabular-nums ${ms <= 0 ? "text-[#F2B8B5]" : ""}`}>{fmtClock(ms)}</div>
          </div>
          <div className="mt-4 flex gap-2">
            <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="Vishal's one-line note (optional)" className="h-10 flex-1 rounded-full bg-white/15 px-4 text-sm text-white outline-none placeholder:text-white/60" />
            <Button variant="tonal" onClick={async () => { if (note) await act("queue_note", { id: cur.id, note }); await act("queue_end", { id: cur.id }, "Session ended"); setNote(""); }}>
              End session
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl bg-tint p-6">
          <div className="flex-1">
            <div className="text-sm text-ink2">Next</div>
            <div className="font-display text-3xl">{waiting[0] ? `Table ${waiting[0].table_no} · ${waiting[0].team_name}` : "No one waiting"}</div>
          </div>
          <Button disabled={!waiting[0]} onClick={() => act("queue_start", { id: waiting[0].id }, "Session started")}>
            <Icon name="play_arrow" size={18} /> Start 2:00
          </Button>
        </div>
      )}

      <div className="divide-y divide-line rounded-2xl border border-line">
        {waiting.map((q: any, i: number) => (
          <div key={q.id} className="flex items-start gap-4 px-5 py-4">
            <span className="w-8 font-display text-2xl text-primary">{i + 1}</span>
            <div className="flex-1">
              <div className="font-medium">
                Table {q.table_no} · {q.team_name}
                {q.skip_count > 0 && <span className="ml-2 rounded bg-[#FEF7E0] px-1.5 text-xs text-[#7A4F01]">skipped once</span>}
              </div>
              <div className="mt-1 text-sm text-ink2">{q.question}</div>
              <div className="mt-1 text-xs text-ink2">waiting {Math.floor((now - Date.parse(q.created_at)) / 60000)} min {q.doc_ids?.length ? `· ${q.doc_ids.join(", ")}` : ""}</div>
            </div>
            <div className="flex items-center">
              <IconButton icon="arrow_upward" title="Move up" disabled={i === 0} onClick={() => act("queue_move", { id: q.id, dir: "up" })} />
              <IconButton icon="arrow_downward" title="Move down" disabled={i === waiting.length - 1} onClick={() => act("queue_move", { id: q.id, dir: "down" })} />
              <Button variant="text" disabled={!!cur} onClick={() => act("queue_start", { id: q.id }, "Session started")}>Start</Button>
              <Button variant="text" onClick={() => act("queue_skip", { id: q.id }, q.skip_count ? "Skipped twice: session used" : "Skipped: moved to position 3")}>Skip</Button>
              <Button variant="text" onClick={() => act("queue_cancel", { id: q.id }, "Cancelled")}>Cancel</Button>
            </div>
          </div>
        ))}
        {waiting.length === 0 && <p className="p-5 text-sm text-ink2">The queue is empty.</p>}
      </div>

      {data.recentSessions.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Recent</div>
          <div className="space-y-1 text-sm">
            {data.recentSessions.map((r: any) => (
              <div key={r.id} className="flex gap-3 text-ink2">
                <span className="w-20 font-mono text-xs">{r.ended_at ? new Date(r.ended_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                <span className="w-40 truncate text-ink">{r.team_name}</span>
                <span className="w-20">{r.status}</span>
                <span className="flex-1 truncate">{r.expert_note ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeskPanel({ data, act, now }: { data: any; act: Act; now: number }) {
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  return (
    <div>
      <H sub="Scripted answers go out instantly. Overwrite one within 60 seconds if it's wrong; the team's screen updates.">Accounts desk</H>
      <div className="space-y-3">
        {data.cfo.map((q: any) => {
          const fresh = now - Date.parse(q.created_at) < 60_000;
          return (
            <div key={q.id} className={`rounded-2xl border p-4 ${fresh ? "border-primary bg-[#EDF2FA]" : "border-line"}`}>
              <div className="flex items-center gap-2 text-xs text-ink2">
                <span className="font-medium text-ink">{q.team_name}</span>
                <span>{new Date(q.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                {q.matched_topic ? <span className="rounded bg-tint px-1.5">{q.matched_topic}</span> : <span className="rounded bg-[#FEF7E0] px-1.5 text-[#7A4F01]">fallback</span>}
                {q.overridden_by_admin && <span className="rounded bg-[#E8DEF8] px-1.5 text-[#4A4458]">overridden</span>}
                {fresh && <span className="ml-auto font-mono text-primary">{60 - Math.floor((now - Date.parse(q.created_at)) / 1000)}s</span>}
              </div>
              <div className="mt-2 text-sm font-medium">Q: {q.question}</div>
              {edit?.id === q.id ? (
                <div className="mt-2 flex gap-2">
                  <textarea value={edit!.text} onChange={(x) => setEdit({ id: q.id, text: x.target.value })} rows={2} className="flex-1 rounded-lg border border-outline p-2 text-sm outline-none focus:border-primary" />
                  <div className="flex flex-col gap-1">
                    <Button onClick={async () => { await act("cfo_override", { id: q.id, answer: edit!.text }, "Answer replaced"); setEdit(null); }}>Save</Button>
                    <Button variant="text" onClick={() => setEdit(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-start gap-2 text-sm text-ink2">
                  <span className="flex-1">A: {q.answer}</span>
                  <Button variant="text" onClick={() => setEdit({ id: q.id, text: q.answer })}>Overwrite</Button>
                </div>
              )}
            </div>
          );
        })}
        {data.cfo.length === 0 && <p className="text-sm text-ink2">No questions yet.</p>}
      </div>
    </div>
  );
}

function Grading({ data, act, toast }: { data: any; act: Act; toast: (m: string) => void }) {
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, { ai: string; reason: string; pitch: string }>>({});
  const submitted = data.teams.filter((t: any) => t.report?.status === "submitted");

  const grade = async (id: string) => {
    setRunning((s) => new Set(s).add(id));
    try {
      await act("grade", { teamId: id });
    } catch {
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };
  const gradeAll = async () => {
    const ids = submitted.filter((t: any) => !t.score?.ai_total).map((t: any) => t.id);
    toast(`Grading ${ids.length} reports, 3 at a time…`);
    const queue = [...ids];
    await Promise.all(
      [0, 1, 2].map(async () => {
        while (queue.length) await grade(queue.shift()!);
      }),
    );
    toast("Grading finished.");
  };
  const ed = (id: string) => edits[id] ?? { ai: "", reason: "", pitch: "" };
  const ranked = [...data.teams].sort((a: any, b: any) => total(b) - total(a));

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <H sub="Total 100: report 50 (graded twice by Claude), Vishal questions 30 and pitch 20 (entered here). A gap over 3 marks, a failed run or a prompt-injection attempt flags a report for review. Check the top 3 and every flagged report before publishing.">
          Grading & results
        </H>
        <div className="flex shrink-0 gap-2">
          <Button variant="outlined" onClick={gradeAll} disabled={running.size > 0}>
            <Icon name="smart_toy" size={18} /> Grade all ungraded
          </Button>
          <Button variant={data.event.leaderboard_published ? "tonal" : "filled"} onClick={() => act("publish_leaderboard", { value: !data.event.leaderboard_published }, data.event.leaderboard_published ? "Leaderboard hidden" : "Leaderboard published")}>
            <Icon name="leaderboard" size={18} /> {data.event.leaderboard_published ? "Hide leaderboard" : "Publish leaderboard"}
          </Button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="h-10 border-b border-line text-left text-xs text-ink2">
            <th className="pl-2 font-medium">#</th>
            <th className="font-medium">Team</th>
            <th className="font-medium">Report</th>
            <th className="font-medium">AI /50</th>
            <th className="font-medium">Gap</th>
            <th className="font-medium">Final AI</th>
            <th className="font-medium">Vishal /30</th>
            <th className="font-medium">Pitch /20</th>
            <th className="font-medium">Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranked.map((t: any, i: number) => {
            const s = t.score ?? {};
            const e = ed(t.id);
            return (
              <tr key={t.id} className={`border-b border-line align-middle ${s.needs_review ? "bg-[#FFF8E1]" : ""}`}>
                <td className="pl-2 text-ink2">{i + 1}</td>
                <td className="py-2 font-medium">
                  {t.name}
                  {s.needs_review && <span className="ml-2 rounded bg-[#FEF7E0] px-1.5 text-xs text-[#7A4F01]">review</span>}
                  {s.accepted && <Icon name="verified" size={16} className="ml-1 text-success" />}
                </td>
                <td>
                  {reportBadge(t.report)}
                  {t.report?.status === "submitted" && (
                    <a className="ml-2 text-xs text-primary hover:underline" href={`/api/admin/report-pdf?team=${t.id}`} target="_blank">
                      PDF
                    </a>
                  )}
                </td>
                <td className="font-mono">{s.ai_total ?? "—"}</td>
                <td className={`font-mono ${(s.variance ?? 0) > 3 ? "font-bold text-danger" : ""}`}>{s.variance ?? "—"}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <input value={e.ai} onChange={(x) => setEdits({ ...edits, [t.id]: { ...e, ai: x.target.value } })} placeholder={String(s.final_ai ?? s.ai_total ?? "")} className="h-8 w-16 rounded border border-outline px-2 font-mono text-xs" />
                    {e.ai && <input value={e.reason} onChange={(x) => setEdits({ ...edits, [t.id]: { ...e, reason: x.target.value } })} placeholder="reason" className="h-8 w-28 rounded border border-outline px-2 text-xs" />}
                    <Button variant="text" className="!h-8 !px-2" disabled={!s.ai_total && !e.ai} onClick={() => act("accept", { teamId: t.id, final_ai: e.ai || null, reason: e.reason }, "Accepted")}>
                      Accept
                    </Button>
                  </div>
                </td>
                <td>
                  <input
                    defaultValue={s.vishal_marks ?? ""}
                    onBlur={(x) => x.target.value !== String(s.vishal_marks ?? "") && x.target.value !== "" && act("vishal_marks", { teamId: t.id, marks: Number(x.target.value) }, "Vishal marks saved")}
                    className="h-8 w-14 rounded border border-outline px-2 font-mono text-xs"
                  />
                </td>
                <td>
                  <input
                    defaultValue={s.pitch_marks ?? ""}
                    onBlur={(x) => x.target.value !== String(s.pitch_marks ?? "") && x.target.value !== "" && act("pitch_marks", { teamId: t.id, marks: Number(x.target.value) }, "Pitch marks saved")}
                    className="h-8 w-14 rounded border border-outline px-2 font-mono text-xs"
                  />
                </td>
                <td className="font-mono font-medium">{total(t) || "—"}</td>
                <td className="whitespace-nowrap text-right">
                  <Button variant="text" className="!h-8 !px-2" disabled={t.report?.status !== "submitted" || running.has(t.id)} onClick={() => grade(t.id)}>
                    {running.has(t.id) ? "Grading…" : s.ai_total ? "Re-run" : "Grade"}
                  </Button>
                  <IconButton icon="data_object" title="Grader output" onClick={() => api(`/api/admin/activity?team=${t.id}`).then((d) => setDetail({ team: t, grades: d.grades }))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={`Grader runs · ${detail?.team.name}`} width={900}>
        <div className="grid gap-4 md:grid-cols-2">
          {detail?.grades.slice(-2).map((g: any) => (
            <div key={g.id} className="rounded-xl border border-line p-3 text-xs">
              <div className="mb-2 font-medium">
                Run {g.run_no} · {g.total ?? "error"}
              </div>
              {g.error ? (
                <p className="text-danger">{g.error}</p>
              ) : (
                <>
                  <p className="mb-2 text-ink2">{g.json_result?.one_line_feedback}</p>
                  {g.json_result?.injection_detected && <p className="mb-2 font-medium text-danger">Injection attempt: {g.json_result.flags?.join(" | ")}</p>}
                  <div className="mb-1 font-medium">Matched issues</div>
                  {g.json_result?.matched_issues?.map((m: any, i: number) => (
                    <div key={i}>
                      {m.issue_id} (row {m.finding_row}): +{m.points_awarded} — {m.reason}
                    </div>
                  ))}
                  {g.json_result?.red_herring_penalties?.length > 0 && <div className="mt-2 font-medium text-danger">Penalties</div>}
                  {g.json_result?.red_herring_penalties?.map((m: any, i: number) => (
                    <div key={i}>
                      {m.id}: {m.penalty} — {m.reason}
                    </div>
                  ))}
                  <div className="mt-2">
                    Findings {g.json_result?.findings_score} · Quant {g.json_result?.quantification?.total} · Rec {g.json_result?.recommendation?.total}
                  </div>
                  <div className="mt-1 text-ink2">{g.json_result?.quantification?.reason}</div>
                  <div className="mt-1 text-ink2">{g.json_result?.recommendation?.reason}</div>
                </>
              )}
            </div>
          ))}
          {detail?.grades.length === 0 && <p className="text-sm text-ink2">Not graded yet.</p>}
        </div>
      </Dialog>
    </div>
  );
}

const total = (t: any) => {
  const s = t.score;
  if (!s) return 0;
  return Math.round((Number(s.final_ai ?? s.ai_total ?? 0) + Number(s.vishal_marks ?? 0) + Number(s.pitch_marks ?? 0)) * 10) / 10;
};

function Setup({ e, data, act }: { e: any; data: any; act: Act }) {
  const [count, setCount] = useState(String(Math.max(data.teams.length, 10)));
  const [confirm, setConfirm] = useState("");
  return (
    <div className="space-y-8">
      <div>
        <H sub="Creates teams with names and 6-character codes. Running it again only adds missing teams.">Teams and login cards</H>
        <div className="flex items-center gap-3">
          <input value={count} onChange={(x) => setCount(x.target.value)} className="h-10 w-24 rounded-full border border-outline px-4 text-sm" inputMode="numeric" />
          <Button onClick={() => act("setup_teams", { count: Number(count) }, "Teams created")}>Create teams</Button>
          <a href="/admin/cards" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-primary hover:bg-[#0B57D014]">
            <Icon name="print" size={18} /> Print login cards
          </a>
        </div>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
          {data.teams.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="flex-1 truncate font-medium">{t.name}</span>
              <span className="font-mono text-xs">{t.code}</span>
              <IconButton icon="delete" title="Delete team" className="!h-8 !w-8" onClick={() => confirmDelete(t, act)} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#F2B8B5] p-5">
        <H sub="For after a dry run. Deletes every note, request, question, report, grade and log, and returns the event to the start. Teams and codes are kept.">Reset event</H>
        <div className="flex gap-2">
          <input value={confirm} onChange={(x) => setConfirm(x.target.value)} placeholder="Type RESET" className="h-10 w-40 rounded-full border border-outline px-4 text-sm" />
          <Button variant="danger" disabled={confirm !== "RESET"} onClick={() => act("reset_event", { confirm }, "Event reset").then(() => setConfirm(""))}>
            Reset everything
          </Button>
        </div>
      </div>
    </div>
  );
}

function confirmDelete(t: any, act: Act) {
  if (window.confirm(`Delete team ${t.name} and all its data?`)) act("delete_team", { teamId: t.id }, "Team deleted");
}

function Exports() {
  const items = [
    { type: "pdfs", icon: "folder_zip", label: "All report PDFs (zip)" },
    { type: "json", icon: "data_object", label: "All report JSON" },
    { type: "scores", icon: "table_view", label: "Scores (CSV)" },
    { type: "activity", icon: "history", label: "Activity log (CSV)" },
  ];
  return (
    <div>
      <H>Exports</H>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <a key={i.type} href={`/api/admin/export?type=${i.type}`} className="flex items-center gap-4 rounded-2xl border border-line p-5 hover:bg-hover">
            <Icon name={i.icon} size={28} className="text-primary" />
            <span className="font-medium">{i.label}</span>
            <Icon name="download" className="ml-auto text-ink2" />
          </a>
        ))}
      </div>
    </div>
  );
}


