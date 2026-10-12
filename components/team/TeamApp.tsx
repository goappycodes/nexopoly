"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { emptyReport, phaseLabel, wordCount, type ManifestDoc, type Note, type ReportData } from "@/lib/types";
import { Brand, Button, Icon, Snackbar, api, chime, fmtClock, remainingMs, useTick } from "../ui";
import { useLive } from "../live";
import { useLockdown } from "./lockdown";
import { Drive } from "./Drive";
import { Viewer } from "./Viewer";
import { AllNotes, NotesPanel, useNotes } from "./Notes";
import { ReportBuilder } from "./Report";
import { AskVishalDialog, VishalPanel } from "./Vishal";
import type { TeamState, View } from "./types";

export default function TeamApp() {
  const router = useRouter();
  const [replaced, setReplaced] = useState(false);
  const { data, reload } = useLive<TeamState>("/api/team/state", 4000, {
    onError: (e) => {
      if (e.status === 401) router.replace("/");
      if (e.status === 409) setReplaced(true);
    },
  });
  const [view, setView] = useState<View>({ kind: "drive", folder: null });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<ManifestDoc | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const currentDoc = useCallback(() => (viewRef.current.kind === "doc" ? viewRef.current.docId : null), []);
  useLockdown(currentDoc);
  const { notes, folders, create, update, remove } = useNotes(!!data);

  // ---- Report state lives here so notes can be promoted into it. ----
  const [report, setReportState] = useState<ReportData>(emptyReport());
  const [reportMeta, setReportMeta] = useState<{ status: string; submitted_at: string | null; auto_submitted: boolean }>({ status: "not_started", submitted_at: null, auto_submitted: false });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const reportLoaded = useRef(false);
  const reportRef = useRef(report);
  reportRef.current = report;

  const loadReport = useCallback(async () => {
    const r = await api<{ report: ReportData; status: string; submitted_at: string | null; auto_submitted: boolean }>("/api/team/report");
    setReportState(r.report);
    setReportMeta({ status: r.status, submitted_at: r.submitted_at, auto_submitted: r.auto_submitted });
    reportLoaded.current = true;
  }, []);
  useEffect(() => {
    if (data && !reportLoaded.current) loadReport().catch(() => {});
  }, [data, loadReport]);
  useEffect(() => {
    if (data?.report.status === "submitted" && reportMeta.status !== "submitted") loadReport().catch(() => {});
  }, [data?.report.status, reportMeta.status, loadReport]);

  const setReport = useCallback((fn: (r: ReportData) => ReportData) => {
    dirty.current = true;
    setReportState(fn);
  }, []);

  const phase = data?.state.phase;
  const saveReport = useCallback(async () => {
    if (!dirty.current || !reportLoaded.current) return;
    if (phase !== "audit" && phase !== "report") return;
    dirty.current = false;
    setSaving(true);
    try {
      const r = await api<{ savedAt: string }>("/api/team/report", { method: "PUT", json: { data: reportRef.current } });
      setSavedAt(r.savedAt);
    } catch {
      dirty.current = true;
    } finally {
      setSaving(false);
    }
  }, [phase]);
  useEffect(() => {
    const t = setInterval(saveReport, 10_000);
    return () => clearInterval(t);
  }, [saveReport]);
  useEffect(() => {
    saveReport();
  }, [view.kind, saveReport]);

  // ---- Toasts and inject arrivals. ----
  useEffect(() => {
    const t = (e: Event) => setToast((e as CustomEvent).detail);
    window.addEventListener("nexo-toast", t);
    return () => window.removeEventListener("nexo-toast", t);
  }, []);

  const seenInbox = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.inbox.map((d) => d.docId));
    if (seenInbox.current) {
      const fresh = data.inbox.find((d) => !seenInbox.current!.has(d.docId));
      if (fresh) {
        setBanner(fresh);
        chime();
      }
    }
    seenInbox.current = ids;
  }, [data]);

  const docs = useMemo(() => new Map([...(data?.files ?? []), ...(data?.inbox ?? [])].map((d) => [d.docId, d as ManifestDoc])), [data]);
  const notesByDoc = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => m.set(n.doc_id, (m.get(n.doc_id) ?? 0) + 1));
    return m;
  }, [notes]);

  const now = useTick(500);

  if (replaced) {
    return (
      <Full>
        <Icon name="devices" size={56} className="text-primary" />
        <h1 className="mt-4 font-display text-3xl">Signed in on another device</h1>
        <p className="mt-2 max-w-md text-ink2">Your team signed in on a different laptop, so this session ended. This has been logged.</p>
        <Button className="mt-6" onClick={() => router.replace("/")}>
          Sign in again
        </Button>
      </Full>
    );
  }
  if (!data) {
    return (
      <Full>
        <Icon name="progress_activity" size={40} className="animate-spin text-primary" />
      </Full>
    );
  }

  const st = data.state;
  const canNote = ["lobby", "briefing", "audit", "report"].includes(st.phase);
  const findingsOpen = reportMeta.status !== "submitted" && (st.phase === "audit" || st.phase === "report");
  const rem = remainingMs(st, now);
  const left = data.vishal.limit - data.vishal.used;
  const unread = data.inbox.filter((d) => !d.read).length;
  const citableDocs = data.citable.map((id) => docs.get(id)).filter(Boolean) as ManifestDoc[];

  const openDoc = (d: ManifestDoc, p = 1) => {
    setView({ kind: "doc", docId: d.docId, page: p, from: view.kind === "doc" ? view.from : view });
    setPage(p);
    setSelectedNote(null);
    if (d.inject) api("/api/team/inbox", { method: "POST", json: { inject: d.inject } }).then(reload).catch(() => {});
  };
  const goBack = () => setView(view.kind === "doc" && view.from ? view.from : { kind: "drive", folder: null });

  const promote = (n: Note) => {
    if (!findingsOpen) return setToast("The findings table opens when the audit starts.");
    if (report.findings.length >= 15) return setToast("The findings table is full (15 rows).");
    const words = n.text.trim().split(/\s+/);
    setReport((r) => ({
      ...r,
      findings: [
        ...r.findings,
        {
          id: crypto.randomUUID(),
          title: words.slice(0, 8).join(" ").slice(0, 120),
          description: words.slice(0, 60).join(" "),
          evidence: [n.doc_id],
          type: (n.tag as any) ?? "",
          status: (n.status as any) ?? "",
          impact: null,
          impactOn: "",
        },
      ],
    }));
    setToast(`Added to findings as row ${report.findings.length + 1}.`);
  };

  const submitReport = async () => {
    await api("/api/team/report/submit", { method: "POST", json: { data: report } });
    dirty.current = false;
    await loadReport();
    reload();
    setToast("Report submitted.");
  };

  const openDocView = view.kind === "doc" ? docs.get(view.docId) : undefined;
  const docNotes = openDocView ? notes.filter((n) => n.doc_id === openDocView.docId) : [];

  const nav = [
    { id: "drive", icon: "folder_open", label: "Case files", active: view.kind === "drive" && view.folder !== "Inbox", go: () => setView({ kind: "drive", folder: null }) },
    { id: "inbox", icon: "inbox", label: "Inbox", badge: unread, active: view.kind === "drive" && view.folder === "Inbox", go: () => setView({ kind: "drive", folder: "Inbox" }) },
    { id: "notes", icon: "sticky_note_2", label: "All notes", badge: 0, active: view.kind === "notes", go: () => setView({ kind: "notes" }) },
    { id: "report", icon: "assignment", label: "Report", active: view.kind === "report", go: () => setView({ kind: "report" }) },
  ];

  return (
    <div className="lockdown flex h-screen flex-col overflow-hidden bg-app">
      {/* ---------- Top bar ---------- */}
      <header className="flex h-16 shrink-0 items-center gap-4 px-4">
        <div className="w-[232px] shrink-0 pl-2">
          <Brand />
        </div>
        <div className="flex h-12 max-w-[720px] flex-1 items-center gap-3 rounded-full bg-hover px-4 focus-within:bg-white focus-within:shadow-e1">
          <Icon name="search" className="text-ink2" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (view.kind !== "drive") setView({ kind: "drive", folder: null });
            }}
            disabled={data.access === "locked"}
            placeholder="Search in Nexopoly"
            className="h-full flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink2"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-ink2">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className={`flex h-10 items-center gap-3 rounded-full px-4 ${rem !== null && rem < 5 * 60_000 && rem > 0 ? "bg-[#FCE8E6] text-danger" : "bg-white text-ink"} shadow-e1`}>
            <span className="text-sm font-medium">{phaseLabel(st.phase)}</span>
            {rem !== null && (
              <span className="font-mono text-lg tabular-nums">
                {st.paused ? <Icon name="pause" size={18} className="mr-1 align-[-3px]" /> : null}
                {fmtClock(rem)}
              </span>
            )}
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm text-ink2 shadow-e1 lg:flex" title="Sessions with Vishal left">
            <Icon name="record_voice_over" size={18} /> {left} left
          </div>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-medium text-white" title={data.team.name}>
              {data.team.name[0]}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-40 mt-2 w-80 rounded-[28px] bg-[#E9EEF6] p-4 shadow-e3">
                  <div className="rounded-3xl bg-white p-5 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary font-display text-3xl text-white">{data.team.name[0]}</div>
                    <div className="mt-3 font-display text-xl">Team {data.team.name}</div>
                    <div className="text-sm text-ink2">Table {data.team.table_no}</div>
                    <div className="mt-2 text-sm text-ink2">{data.team.members.join(", ")}</div>
                  </div>
                  <button
                    onClick={async () => {
                      await api("/api/auth/logout", { method: "POST" });
                      router.replace("/");
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-medium text-ink hover:bg-tint"
                  >
                    <Icon name="logout" size={18} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {st.announcement && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-[#D3E3FD] px-5 py-3 text-sm text-[#041E49]">
          <Icon name="campaign" /> <span className="font-medium">{st.announcement}</span>
        </div>
      )}
      {banner && (
        <div className="anim-in mx-4 mb-2 flex items-center gap-4 rounded-2xl bg-[#FFF8E1] px-5 py-3 text-sm text-[#5C3B00] shadow-e1">
          <Icon name="mark_email_unread" fill className="text-[#E37400]" />
          <span>
            <b>New file in your Inbox:</b> {banner.title}
          </span>
          <Button
            variant="text"
            className="ml-auto"
            onClick={() => {
              openDoc(banner);
              setBanner(null);
            }}
          >
            Open
          </Button>
          <button onClick={() => setBanner(null)}>
            <Icon name="close" size={20} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ---------- Left navigation ---------- */}
        <nav className="flex w-[256px] shrink-0 flex-col px-3 pb-4">
          <button
            onClick={() => setAskOpen(true)}
            disabled={!st.queueOpen || left <= 0 || !!data.vishal.request}
            className="mb-4 ml-1 flex h-14 w-fit items-center gap-3 rounded-2xl bg-white pl-4 pr-5 text-sm font-medium text-ink shadow-e1 transition hover:bg-[#EDF2FA] hover:shadow-e2 disabled:opacity-50 disabled:shadow-none"
            title={!st.queueOpen ? "Vishal's queue is closed" : left <= 0 ? "No sessions left" : data.vishal.request ? "You are already in the queue" : "Ask Vishal"}
          >
            <Icon name="record_voice_over" size={24} className="text-primary" /> Ask Vishal
          </button>
          {nav.map((n) => (
            <div key={n.id}>
              <button
                onClick={n.go}
                disabled={data.access === "locked" && n.id !== "report"}
                className={`flex h-8 w-full items-center gap-4 rounded-full pl-4 pr-3 text-sm transition disabled:opacity-40 ${n.active ? "bg-selected font-medium text-[#001D35]" : "text-ink hover:bg-hover"}`}
              >
                <Icon name={n.icon} size={20} fill={n.active} />
                <span className="flex-1 text-left">{n.label}</span>
                {!!n.badge && <span className="text-xs font-bold">{n.badge}</span>}
              </button>
              {n.id === "drive" && data.access !== "locked" && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-line pl-2">
                  {Array.from(new Set(data.files.map((f) => f.folder)))
                    .sort()
                    .map((f) => {
                      const active = (view.kind === "drive" && view.folder === f) || (openDocView && openDocView.folder === f);
                      return (
                        <button
                          key={f}
                          onClick={() => setView({ kind: "drive", folder: f })}
                          className={`flex h-7 w-full items-center gap-2 rounded-full pl-2 pr-2 text-left text-[13px] ${active ? "bg-hover font-medium text-ink" : "text-ink2 hover:bg-hover"}`}
                        >
                          <Icon name="folder" size={18} fill={!!active} />
                          <span className="truncate">{f}</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          ))}
          <div className="mt-auto space-y-4 px-3 pt-6 text-xs text-ink2">
            <Meter label="Sessions with Vishal" used={data.vishal.used} total={data.vishal.limit} />
          </div>
        </nav>

        {/* ---------- Main surface ---------- */}
        <main className="mb-4 mr-4 flex min-w-0 flex-1 overflow-hidden rounded-2xl bg-white">
          {data.access === "locked" && view.kind !== "report" ? (
            <Closed phase={st.phase} report={reportMeta} onView={() => setView({ kind: "report" })} />
          ) : view.kind === "doc" && openDocView ? (
            <>
              <Viewer
                doc={openDocView}
                page={page}
                setPage={setPage}
                watermark={`${data.team.name} · ${data.team.code}`}
                notes={docNotes}
                selectedNote={selectedNote}
                onSelectNote={setSelectedNote}
                onCreateNote={async (p, x, y, text) => {
                  const n = await create(openDocView.docId, p, x, y, text);
                  setSelectedNote(n.id);
                }}
                canNote={canNote}
                onBack={goBack}
                onClose={goBack}
              />
              <NotesPanel
                doc={openDocView}
                page={page}
                notes={docNotes}
                selected={selectedNote}
                canEdit={canNote}
                onSelect={(n) => {
                  setSelectedNote(n.id);
                  if (n.page_no !== page) setPage(n.page_no);
                }}
                onUpdate={update}
                onRemove={remove}
                onPromote={promote}
                onAddUnpinned={async () => {
                  const n = await create(openDocView.docId, page, null, null, "");
                  setSelectedNote(n.id);
                }}
              />
            </>
          ) : view.kind === "notes" ? (
            <div className="flex-1">
              <AllNotes
                notes={notes}
                folders={folders}
                docs={docs}
                canEdit={canNote}
                onOpen={(n) => {
                  const d = docs.get(n.doc_id);
                  if (d) {
                    openDoc(d, n.page_no);
                    setSelectedNote(n.id);
                  }
                }}
                onUpdate={update}
                onRemove={remove}
                onPromote={promote}
              />
            </div>
          ) : view.kind === "report" ? (
            <div className="flex-1 bg-[#F0F4F9]">
              <ReportBuilder
                report={report}
                setReport={setReport}
                phase={st.phase}
                status={reportMeta.status}
                submittedAt={reportMeta.submitted_at}
                autoSubmitted={reportMeta.auto_submitted}
                savedAt={savedAt}
                saving={saving}
                team={data.team}
                docs={citableDocs}
                onSubmit={submitReport}
              />
            </div>
          ) : (
            <div className="flex-1">
              <Drive
                files={data.files}
                inbox={data.inbox}
                folder={view.kind === "drive" ? view.folder : null}
                search={search}
                access={data.access}
                notesByDoc={notesByDoc}
                onOpenFolder={(f) => setView({ kind: "drive", folder: f })}
                onOpenDoc={(d) => openDoc(d)}
              />
            </div>
          )}
        </main>
      </div>

      <AskVishalDialog open={askOpen} onClose={() => setAskOpen(false)} docs={citableDocs} vishal={data.vishal} queueOpen={st.queueOpen} onDone={(m) => { setToast(m); reload(); }} />
      <VishalPanel
        vishal={data.vishal}
        onCancel={async () => {
          await api("/api/team/vishal", { method: "DELETE" }).catch(() => {});
          reload();
        }}
      />
      <Snackbar message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Full({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-app p-6 text-center">{children}</div>;
}

function Meter({ label, used, total }: { label: string; used: number; total: number }) {
  return (
    <div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-primary" style={{ width: `${total ? Math.min(100, (used / total) * 100) : 0}%` }} />
      </div>
      <div className="mt-1.5">
        {label}: {used} of {total} used
      </div>
    </div>
  );
}

function Closed({ phase, report, onView }: { phase: string; report: { status: string; submitted_at: string | null; auto_submitted: boolean }; onView: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <Icon name="lock" size={56} className="text-outline" />
      <h1 className="mt-4 font-display text-3xl text-ink">{phase === "results" ? "Results are on the screen" : phase === "pitches" ? "Pitches are under way" : "Submissions are closed"}</h1>
      <p className="mt-2 max-w-md text-ink2">
        {report.status === "submitted"
          ? `Your report was ${report.auto_submitted ? "submitted automatically" : "submitted"} at ${report.submitted_at ? new Date(report.submitted_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}.`
          : "Your report is being submitted."}{" "}
        The Drive is now locked.
      </p>
      <Button variant="outlined" className="mt-6" onClick={onView}>
        View your report
      </Button>
    </div>
  );
}

export { wordCount };
