"use client";

import { useEffect, useMemo, useState } from "react";
import type { ManifestDoc } from "@/lib/types";
import { Brand, Button, Icon, TextField, api, inr } from "@/components/ui";
import { Drive } from "@/components/team/Drive";
import { Viewer } from "@/components/team/Viewer";
import type { InboxDoc } from "@/components/team/types";

interface Issue {
  id: string;
  level: string;
  points: number;
  title: string;
  type: string;
  evidence_any: string[];
  evidence_strong: string[];
  must_identify: string;
  partial_credit: string;
  rupee_impact: number;
  impact_on: string;
}
interface Key {
  claimed: { revenue?: number; pbt: number; pat: number; operating_cash_flow: number };
  restated: {
    pbt: number;
    pbt_accept_min: number;
    pbt_accept_max: number;
    cash_leakage: number;
    cash_leakage_tolerance_pct: number;
    operating_cash_flow: number;
    ocf_tolerance: number;
    workings?: { label: string; amount: number }[];
  };
  issues: Issue[];
  red_herrings: { id: string; title: string; penalty: number; penalise_if: string; no_penalty_if: string }[];
  recommendation: { best: string[]; conditions_that_count: string[] };
}
interface FacultyData {
  company: string;
  docs: ManifestDoc[];
  key: Key | null;
  keyError: string | null;
}

type View = { kind: "drive"; folder: string | null } | { kind: "doc"; docId: string; from: View } | { kind: "anomalies" };

const LEVEL: Record<string, string> = { Easy: "bg-[#C4EED0] text-[#0D652D]", Medium: "bg-[#FEF7E0] text-[#7A4F01]", Hard: "bg-[#FCE8E6] text-[#8C1D18]" };
const facultyPage = (docId: string, page: number) => `/api/faculty/img?doc=${encodeURIComponent(docId)}&p=${page}`;

export default function FacultyPage() {
  const [data, setData] = useState<FacultyData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    api<FacultyData>("/api/faculty")
      .then((d) => {
        setData(d);
        setAuthed(true);
      })
      .catch((e) => setAuthed(e.status === 401 ? false : true));
  }, []);
  if (authed === false) return <FacultyLogin />;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-app"><Icon name="progress_activity" className="animate-spin text-primary" size={40} /></div>;
  return <Review data={data} />;
}

function FacultyLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-tint p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/auth/faculty", { method: "POST", json: { password: pw } });
            location.reload();
          } catch (x: any) {
            setErr(x.message);
          }
        }}
        className="w-full max-w-md rounded-[28px] bg-white p-10"
      >
        <Brand />
        <h1 className="mt-8 font-display text-[32px]">Faculty review</h1>
        <p className="mt-2 text-sm text-ink2">Every case document the teams get, and the list of planted anomalies. Confidential: please don&apos;t share before the event.</p>
        <TextField className="mt-8" label="Faculty password" type="password" value={pw} onChange={setPw} autoFocus />
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-8 flex justify-end">
          <Button type="submit">Sign in</Button>
        </div>
      </form>
    </main>
  );
}

function Review({ data }: { data: FacultyData }) {
  const [view, setView] = useState<View>({ kind: "drive", folder: null });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const files = useMemo(() => data.docs.filter((d) => !d.inject), [data.docs]);
  const inbox = useMemo<InboxDoc[]>(() => data.docs.filter((d) => d.inject).map((d) => ({ ...d, read: true })), [data.docs]);
  const docs = useMemo(() => new Map(data.docs.map((d) => [d.docId, d])), [data.docs]);
  const folders = useMemo(() => Array.from(new Set(files.map((f) => f.folder))).sort(), [files]);
  const noNotes = useMemo(() => new Map<string, number>(), []);

  const openDoc = (d: ManifestDoc) => {
    setView({ kind: "doc", docId: d.docId, from: view.kind === "doc" ? view.from : view });
    setPage(1);
  };
  const goBack = () => setView(view.kind === "doc" ? view.from : { kind: "drive", folder: null });
  const openDocView = view.kind === "doc" ? docs.get(view.docId) : undefined;

  const nav = [
    { id: "drive", icon: "folder_open", label: "Case files", active: view.kind === "drive" && view.folder !== "Inbox", go: () => setView({ kind: "drive", folder: null }) },
    { id: "inbox", icon: "inbox", label: "Inbox", active: view.kind === "drive" && view.folder === "Inbox", go: () => setView({ kind: "drive", folder: "Inbox" }) },
    { id: "anomalies", icon: "report", label: "All anomalies", active: view.kind === "anomalies", go: () => setView({ kind: "anomalies" }) },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app">
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
          <span className="hidden rounded-full bg-[#E8DEF8] px-3 py-1 text-xs font-medium text-[#4A4458] md:inline">Faculty review</span>
          <Button
            variant="text"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" }).catch(() => {});
              location.reload();
            }}
          >
            <Icon name="logout" size={18} /> Sign out
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[256px] shrink-0 flex-col px-3 pb-4">
          {nav.map((n) => (
            <div key={n.id}>
              <button
                onClick={n.go}
                className={`flex h-8 w-full items-center gap-4 rounded-full pl-4 pr-3 text-sm transition ${n.active ? "bg-selected font-medium text-[#001D35]" : "text-ink hover:bg-hover"}`}
              >
                <Icon name={n.icon} size={20} fill={n.active} />
                <span className="flex-1 text-left">{n.label}</span>
                {n.id === "anomalies" && data.key && <span className="text-xs font-bold">{data.key.issues.length}</span>}
              </button>
              {n.id === "drive" && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-line pl-2">
                  {folders.map((f) => {
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
        </nav>

        <main className="mb-4 mr-4 flex min-w-0 flex-1 overflow-hidden rounded-2xl bg-white">
          {view.kind === "doc" && openDocView ? (
            <Viewer
              doc={openDocView}
              page={page}
              setPage={setPage}
              watermark="Faculty review"
              notes={[]}
              selectedNote={null}
              onSelectNote={() => {}}
              onCreateNote={async () => {}}
              canNote={false}
              onBack={goBack}
              onClose={goBack}
              pageUrl={facultyPage}
              trackOpens={false}
            />
          ) : view.kind === "anomalies" ? (
            <Anomalies data={data} docs={docs} onOpenDoc={openDoc} />
          ) : (
            <div className="flex-1">
              <Drive
                files={files}
                inbox={inbox}
                folder={view.kind === "drive" ? view.folder : null}
                search={search}
                access="all"
                notesByDoc={noNotes}
                onOpenFolder={(f) => setView({ kind: "drive", folder: f })}
                onOpenDoc={openDoc}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Anomalies({ data, docs, onOpenDoc }: { data: FacultyData; docs: Map<string, ManifestDoc>; onOpenDoc: (d: ManifestDoc) => void }) {
  const k = data.key;
  if (!k) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-ink2">
        The answer key couldn&apos;t be loaded ({data.keyError}).
      </div>
    );
  }
  const r = k.restated;
  const totalPoints = k.issues.reduce((s, i) => s + (i.points ?? 0), 0);
  const docChip = (id: string, strong: boolean) => {
    const d = docs.get(id);
    return (
      <button
        key={id}
        disabled={!d}
        onClick={() => d && onOpenDoc(d)}
        title={d?.title}
        className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${strong ? "border-primary text-primary" : "border-outline text-ink2"} hover:bg-hover`}
      >
        {id}
        {strong && " ★"}
      </button>
    );
  };

  return (
    <div className="scroll-thin flex-1 overflow-auto">
      <div className="mx-auto max-w-[1040px] px-6 py-6">
        <div className="text-sm text-ink2">{data.company}</div>
        <h1 className="mt-1 font-display text-[28px] text-ink">All anomalies</h1>
        <p className="mt-1 text-sm text-ink2">
          {k.issues.length} planted issues worth {totalPoints} raw points, and {k.red_herrings.length} red herrings. Click a Doc ID to open it; ★ marks the strongest evidence.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["Profit before tax", k.claimed.pbt, r.pbt, `accepted ${inr(r.pbt_accept_min)} to ${inr(r.pbt_accept_max)}`],
            ["Operating cash flow", k.claimed.operating_cash_flow, r.operating_cash_flow, `± ${inr(r.ocf_tolerance)}`],
            ["Cash leakage", null, r.cash_leakage, `± ${r.cash_leakage_tolerance_pct}%`],
          ].map(([label, a, b, tol]) => (
            <div key={label as string} className="rounded-xl bg-tint p-4">
              <div className="text-xs text-ink2">{label}</div>
              {a !== null && <div className="mt-1 font-mono text-sm text-ink2 line-through">{inr(a as number)}</div>}
              <div className="font-mono text-xl font-medium text-ink">{inr(b as number)}</div>
              <div className="mt-1 text-xs text-ink2">{tol}</div>
            </div>
          ))}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink2">
              <th className="w-16 py-2 pl-2 font-medium">ID</th>
              <th className="py-2 font-medium">Anomaly</th>
              <th className="w-28 py-2 font-medium">Impact</th>
              <th className="w-48 py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {k.issues.map((i) => (
              <tr key={i.id} className="border-b border-line align-top">
                <td className="py-3 pl-2 font-mono text-xs text-ink2">{i.id}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{i.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL[i.level] ?? "bg-tint"}`}>{i.level}</span>
                    <span className="rounded-full bg-tint px-2 py-0.5 text-[11px]">{i.type}</span>
                    <span className="rounded-full bg-tint px-2 py-0.5 text-[11px]">{i.points} pts</span>
                  </div>
                  <p className="mt-1 leading-6 text-ink">{i.must_identify}</p>
                  {i.partial_credit && <p className="mt-1 text-xs leading-5 text-ink2">Partial credit: {i.partial_credit}</p>}
                </td>
                <td className="py-3 pr-2">
                  <div className="font-mono">{inr(i.rupee_impact)}</div>
                  <div className="text-xs text-ink2">{i.impact_on}</div>
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-1">
                    {i.evidence_strong.map((d) => docChip(d, true))}
                    {i.evidence_any.filter((d) => !i.evidence_strong.includes(d)).map((d) => docChip(d, false))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {r.workings && r.workings.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 font-display text-xl text-ink">Bridge from management PBT</h2>
            <div className="rounded-xl border border-line text-sm">
              {r.workings.map((w, i) => (
                <div key={i} className="flex justify-between border-b border-line px-4 py-2 last:border-0">
                  <span>{w.label}</span>
                  <span className="font-mono">{inr(w.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl text-ink">Red herrings</h2>
          <p className="mb-3 text-sm text-ink2">Look suspicious but are legitimate. Teams lose marks only if they call one fraud.</p>
          <div className="space-y-2">
            {k.red_herrings.map((h) => (
              <div key={h.id} className="rounded-xl border border-line p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink2">{h.id}</span>
                  <span className="font-medium">{h.title}</span>
                  <span className="ml-auto text-xs text-ink2">−{h.penalty} if called fraud</span>
                </div>
                <p className="mt-1 text-ink2">{h.no_penalty_if}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4 mt-8 rounded-xl bg-tint p-4 text-sm">
          <h2 className="mb-1 font-medium">Expected recommendation</h2>
          {k.recommendation.best.join(" or ") || "—"}
          {k.recommendation.conditions_that_count.length > 0 && (
            <>
              <div className="mb-1 mt-3 font-medium">Conditions that earn marks</div>
              <ul className="list-disc pl-5">
                {k.recommendation.conditions_that_count.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
