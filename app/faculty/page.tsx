"use client";

import { useEffect, useMemo, useState } from "react";
import type { ManifestDoc } from "@/lib/types";
import { Brand, Button, FileIconColored, Icon, Snackbar, TextField, api, inr } from "@/components/ui";

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
interface RedHerring {
  id: string;
  title: string;
  penalty: number;
  penalise_if: string;
  no_penalty_if: string;
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
  red_herrings: RedHerring[];
  recommendation: { best: string[]; conditions_that_count: string[] };
}
interface Entry {
  key: string;
  text: string;
  updated_at: string;
}
interface FacultyData {
  company: string;
  claimedPbt: number;
  docs: ManifestDoc[];
  key: Key | null;
  keyError: string | null;
  feedback: Record<string, Entry>;
}

type View = { kind: "overview" } | { kind: "issue"; id: string } | { kind: "rh"; id: string } | { kind: "doc"; id: string } | { kind: "all" };

const LEVEL: Record<string, string> = { Easy: "bg-[#C4EED0] text-[#0D652D]", Medium: "bg-[#FEF7E0] text-[#7A4F01]", Hard: "bg-[#FCE8E6] text-[#8C1D18]" };
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
  return <Review data={data} setFeedback={(e, k) => setData((d) => d && { ...d, feedback: withEntry(d.feedback, k, e) })} />;
}

const withEntry = (f: Record<string, Entry>, k: string, e: Entry | null) => {
  const n = { ...f };
  if (e) n[k] = e;
  else delete n[k];
  return n;
};

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
        <p className="mt-2 text-sm text-ink2">Every case document and every planted anomaly, with space for your feedback. Confidential: please don&apos;t share before the event.</p>
        <TextField className="mt-8" label="Faculty password" type="password" value={pw} onChange={setPw} autoFocus />
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-8 flex justify-end">
          <Button type="submit">Sign in</Button>
        </div>
      </form>
    </main>
  );
}

function Review({ data, setFeedback }: { data: FacultyData; setFeedback: (e: Entry | null, key: string) => void }) {
  const [view, setView] = useState<View>({ kind: "overview" });
  const [toast, setToast] = useState<string | null>(null);
  const k = data.key;
  const docs = useMemo(() => new Map(data.docs.map((d) => [d.docId, d])), [data.docs]);
  const folders = useMemo(() => {
    const m = new Map<string, ManifestDoc[]>();
    for (const d of data.docs) m.set(d.folder, [...(m.get(d.folder) ?? []), d]);
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data.docs]);
  const has = (key: string) => !!data.feedback[key];
  const count = Object.keys(data.feedback).length;
  const go = (v: View) => {
    setView(v);
    document.getElementById("faculty-main")?.scrollTo({ top: 0 });
  };
  const box = (key: string, label: string) => (
    <FeedbackBox
      key={key}
      fkey={key}
      label={label}
      entry={data.feedback[key] ?? null}
      onSaved={(e) => {
        setFeedback(e, key);
        setToast(e ? "Feedback saved" : "Feedback cleared");
      }}
      onError={setToast}
    />
  );

  return (
    <div className="flex h-screen flex-col bg-app">
      <header className="flex h-16 shrink-0 items-center gap-4 px-4">
        <div className="w-[232px] pl-2">
          <Brand />
        </div>
        <span className="rounded-full bg-[#E8DEF8] px-3 py-1 text-xs font-medium text-[#4A4458]">Faculty review</span>
        <span className="hidden truncate text-sm text-ink2 md:block">{data.company}</span>
        <Button
          variant="text"
          className="ml-auto"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" }).catch(() => {});
            location.reload();
          }}
        >
          <Icon name="logout" size={18} /> Sign out
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="scroll-thin w-[288px] shrink-0 space-y-0.5 overflow-auto px-3 pb-6">
          <NavItem icon="dashboard" label="Overview and answer" active={view.kind === "overview"} dot={has("overview:case") || has("general:all")} onClick={() => go({ kind: "overview" })} />
          <NavItem icon="rate_review" label="All feedback" badge={count} active={view.kind === "all"} onClick={() => go({ kind: "all" })} />

          {k && (
            <>
              <NavHeading>Anomalies ({k.issues.length})</NavHeading>
              {k.issues.map((i) => (
                <NavItem key={i.id} icon="report" label={`${i.id} · ${i.title}`} active={view.kind === "issue" && view.id === i.id} dot={has(`issue:${i.id}`)} onClick={() => go({ kind: "issue", id: i.id })} />
              ))}
              <NavHeading>Red herrings ({k.red_herrings.length})</NavHeading>
              {k.red_herrings.map((r) => (
                <NavItem key={r.id} icon="check_circle" label={`${r.id} · ${r.title}`} active={view.kind === "rh" && view.id === r.id} dot={has(`rh:${r.id}`)} onClick={() => go({ kind: "rh", id: r.id })} />
              ))}
            </>
          )}

          <NavHeading>Documents ({data.docs.length})</NavHeading>
          {folders.map(([folder, list]) => (
            <div key={folder}>
              <div className="px-4 pb-0.5 pt-2 text-xs text-ink2">{folder}</div>
              {list.map((d) => (
                <NavItem key={d.docId} icon="description" label={`${d.docId} · ${d.title}`} active={view.kind === "doc" && view.id === d.docId} dot={has(`doc:${d.docId}`)} onClick={() => go({ kind: "doc", id: d.docId })} />
              ))}
            </div>
          ))}
        </nav>

        <main id="faculty-main" className="scroll-thin mb-4 mr-4 flex-1 overflow-auto rounded-2xl bg-white p-6 md:p-8">
          <div className="mx-auto max-w-[960px]">
            {!k && view.kind !== "doc" && view.kind !== "all" && (
              <div className="mb-6 rounded-xl bg-[#FEF7E0] p-4 text-sm text-[#7A4F01]">The answer key couldn&apos;t be loaded ({data.keyError}). Documents are still available.</div>
            )}

            {view.kind === "overview" && (
              <>
                <Title kicker={data.company} title="Overview and answer" />
                {k && <Overview k={k} />}
                {box("overview:case", "Feedback on the case as a whole (difficulty, timing, fairness)")}
                {box("general:all", "Anything else")}
              </>
            )}

            {view.kind === "issue" && k && (() => {
              const i = k.issues.find((x) => x.id === view.id);
              return i ? <IssueView issue={i} docs={docs} onOpenDoc={(id) => go({ kind: "doc", id })} feedback={box(`issue:${i.id}`, `Feedback on ${i.id}`)} /> : null;
            })()}

            {view.kind === "rh" && k && (() => {
              const r = k.red_herrings.find((x) => x.id === view.id);
              if (!r) return null;
              return (
                <>
                  <Title kicker={`${r.id} · red herring · −${r.penalty} if called fraud`} title={r.title} />
                  <Field label="Penalised if">{r.penalise_if}</Field>
                  <Field label="Not penalised if">{r.no_penalty_if}</Field>
                  {box(`rh:${r.id}`, `Feedback on ${r.id}`)}
                </>
              );
            })()}

            {view.kind === "doc" && (() => {
              const d = docs.get(view.id);
              if (!d) return null;
              const cited = k?.issues.filter((i) => i.evidence_any.includes(d.docId) || i.evidence_strong.includes(d.docId)) ?? [];
              return (
                <>
                  <Title kicker={`${d.docId} · ${d.folder} · ${d.pages} page${d.pages > 1 ? "s" : ""}`} title={d.title} />
                  {cited.length > 0 && (
                    <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-ink2">Evidence for:</span>
                      {cited.map((i) => (
                        <button key={i.id} onClick={() => go({ kind: "issue", id: i.id })} className="rounded-full border border-outline px-3 py-1 hover:bg-hover">
                          {i.id} · {i.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {box(`doc:${d.docId}`, `Feedback on ${d.docId}`)}
                  <DocPages doc={d} />
                </>
              );
            })()}

            {view.kind === "all" && <AllFeedback data={data} onToast={setToast} onGo={go} />}
          </div>
        </main>
      </div>
      <Snackbar message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function NavHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-1 pt-5 text-xs font-medium uppercase tracking-wider text-ink2">{children}</div>;
}

function NavItem({ icon, label, active, onClick, dot, badge }: { icon: string; label: string; active: boolean; onClick: () => void; dot?: boolean; badge?: number }) {
  return (
    <button onClick={onClick} title={label} className={`flex min-h-9 w-full items-center gap-3 rounded-full py-1.5 pl-4 pr-3 text-left text-sm ${active ? "bg-selected font-medium text-[#001D35]" : "hover:bg-hover"}`}>
      <Icon name={icon} size={18} fill={active} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {dot && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="Has feedback" />}
      {!!badge && <span className="rounded-full bg-primary px-2 text-xs text-white">{badge}</span>}
    </button>
  );
}

function Title({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-6">
      <div className="text-sm text-ink2">{kicker}</div>
      <h1 className="mt-1 font-display text-[28px] leading-tight text-ink">{title}</h1>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink2">{label}</div>
      <div className="text-sm leading-6 text-ink">{children}</div>
    </div>
  );
}

function Overview({ k }: { k: Key }) {
  const r = k.restated;
  const rows: [string, number | undefined, number | undefined, string?][] = [
    ["Profit before tax", k.claimed.pbt, r.pbt, `accepted ${inr(r.pbt_accept_min)} to ${inr(r.pbt_accept_max)}`],
    ["Operating cash flow", k.claimed.operating_cash_flow, r.operating_cash_flow, `± ${inr(r.ocf_tolerance)}`],
    ["Cash leakage", undefined, r.cash_leakage, `± ${r.cash_leakage_tolerance_pct}%`],
  ];
  const total = k.issues.reduce((s, i) => s + (i.points ?? 0), 0);
  return (
    <div className="mb-8 space-y-6">
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-tint text-left text-xs text-ink2">
              <th className="px-4 py-2 font-medium" />
              <th className="px-4 py-2 font-medium">Management</th>
              <th className="px-4 py-2 font-medium">Restated (answer)</th>
              <th className="px-4 py-2 font-medium">Grading tolerance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b, tol]) => (
              <tr key={label} className="border-t border-line">
                <td className="px-4 py-2 font-medium">{label}</td>
                <td className="px-4 py-2 font-mono">{a === undefined ? "—" : inr(a)}</td>
                <td className="px-4 py-2 font-mono">{inr(b)}</td>
                <td className="px-4 py-2 text-ink2">{tol}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.workings && r.workings.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink2">Bridge from management PBT</div>
          <div className="rounded-xl border border-line text-sm">
            {r.workings.map((w, i) => (
              <div key={i} className="flex justify-between border-b border-line px-4 py-2 last:border-0">
                <span>{w.label}</span>
                <span className="font-mono">{inr(w.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-tint p-4 text-sm">
          <div className="mb-1 font-medium">Expected recommendation</div>
          {k.recommendation.best.join(" or ") || "—"}
          <div className="mb-1 mt-3 font-medium">Conditions that earn marks</div>
          <ul className="list-disc pl-5">
            {k.recommendation.conditions_that_count.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-tint p-4 text-sm">
          <div className="mb-1 font-medium">Planted anomalies</div>
          {k.issues.length} issues worth {total} raw points ({["Easy", "Medium", "Hard"].map((l) => `${k.issues.filter((i) => i.level === l).length} ${l.toLowerCase()}`).join(", ")}), and {k.red_herrings.length} red herrings.
          <div className="mt-3 text-ink2">Report marks: findings 25, numbers 10, recommendation 15 (50 of 100). Vishal questions 30 and pitch 20 are marked by the organisers.</div>
        </div>
      </div>
    </div>
  );
}

function IssueView({ issue: i, docs, onOpenDoc, feedback }: { issue: Issue; docs: Map<string, ManifestDoc>; onOpenDoc: (id: string) => void; feedback: React.ReactNode }) {
  const evidence = Array.from(new Set([...i.evidence_strong, ...i.evidence_any]));
  const [shown, setShown] = useState(evidence[0] ?? null);
  const shownDoc = shown ? docs.get(shown) : undefined;
  return (
    <>
      <Title kicker={`${i.id} · ${i.type}`} title={i.title} />
      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 font-medium ${LEVEL[i.level] ?? "bg-tint"}`}>{i.level}</span>
        <span className="rounded-full bg-tint px-3 py-1">{i.points} points</span>
        <span className="rounded-full bg-tint px-3 py-1">
          {inr(i.rupee_impact)} on {i.impact_on}
        </span>
      </div>
      <Field label="Teams must identify">{i.must_identify}</Field>
      <Field label="Partial credit">{i.partial_credit}</Field>
      <Field label="Evidence">
        <div className="flex flex-wrap gap-2">
          {evidence.map((d) => (
            <button
              key={d}
              onClick={() => setShown(d)}
              className={`rounded-full border px-3 py-1 font-mono text-xs ${shown === d ? "border-primary bg-selected text-[#001D35]" : "border-outline hover:bg-hover"}`}
              title={docs.get(d)?.title}
            >
              {d}
              {i.evidence_strong.includes(d) && " ★"}
            </button>
          ))}
        </div>
        <div className="mt-1 text-xs text-ink2">★ strongest evidence. Any listed document counts as a citation.</div>
      </Field>
      {feedback}
      {shownDoc && (
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <FileIconColored kind={shownDoc.kind} size={20} />
            <span className="font-medium">
              {shownDoc.docId} · {shownDoc.title}
            </span>
            <Button variant="text" className="ml-auto" onClick={() => onOpenDoc(shownDoc.docId)}>
              Open document <Icon name="arrow_forward" size={18} />
            </Button>
          </div>
          <DocPages doc={shownDoc} />
        </div>
      )}
    </>
  );
}

function DocPages({ doc }: { doc: ManifestDoc }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: doc.pages }, (_, p) => (
        <div key={`${doc.docId}-${p}`} className="overflow-hidden rounded-lg border border-line bg-tint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/faculty/img?doc=${encodeURIComponent(doc.docId)}&p=${p + 1}`}
            alt={`${doc.docId} page ${p + 1}`}
            width={doc.width}
            height={doc.height}
            loading="lazy"
            className="block h-auto w-full bg-white"
          />
          {doc.pages > 1 && <div className="px-3 py-1 text-right text-xs text-ink2">Page {p + 1} of {doc.pages}</div>}
        </div>
      ))}
    </div>
  );
}

function FeedbackBox({ fkey, label, entry, onSaved, onError }: { fkey: string; label: string; entry: Entry | null; onSaved: (e: Entry | null) => void; onError: (m: string) => void }) {
  const [text, setText] = useState(entry?.text ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = text !== (entry?.text ?? "");
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const r = await api<{ entry: Entry | null }>("/api/faculty/feedback", { method: "PUT", json: { key: fkey, text } });
      onSaved(r.entry);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mb-6 rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon name="rate_review" size={18} className="text-primary" /> {label}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 4000))}
        onBlur={save}
        rows={4}
        placeholder="Is it fair, clear, too easy or too hard? Anything wrong in the document or the expected answer?"
        className="w-full resize-y rounded-md border border-outline bg-[#F8FAFD] px-3 py-2 text-sm leading-6 outline-none focus:border-2 focus:border-primary"
      />
      <div className="mt-2 flex items-center justify-end gap-3 text-xs text-ink2">
        <span>{saving ? "Saving…" : dirty ? "Unsaved changes" : entry ? `Saved ${time(entry.updated_at)}` : "Saves when you click away"}</span>
        <Button variant="tonal" disabled={!dirty || saving} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

function AllFeedback({ data, onToast, onGo }: { data: FacultyData; onToast: (m: string) => void; onGo: (v: View) => void }) {
  const k = data.key;
  const label = (key: string) => {
    const [kind, id] = key.split(":");
    if (key === "overview:case") return "The case as a whole";
    if (key === "general:all") return "Anything else";
    if (kind === "issue") return `${id} · ${k?.issues.find((i) => i.id === id)?.title ?? ""}`;
    if (kind === "rh") return `${id} · ${k?.red_herrings.find((r) => r.id === id)?.title ?? ""} (red herring)`;
    if (kind === "doc") return `${id} · ${data.docs.find((d) => d.docId === id)?.title ?? ""}`;
    return key;
  };
  const target = (key: string): View => {
    const [kind, id] = key.split(":");
    if (kind === "issue") return { kind: "issue", id };
    if (kind === "rh") return { kind: "rh", id };
    if (kind === "doc") return { kind: "doc", id };
    return { kind: "overview" };
  };
  const order = (key: string) => ["overview", "general", "issue", "rh", "doc"].indexOf(key.split(":")[0]);
  const entries = Object.values(data.feedback).sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key));
  const asText = entries.map((e) => `${label(e.key)}\n${e.text}`).join("\n\n");
  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <Title kicker={`${entries.length} item${entries.length === 1 ? "" : "s"}`} title="All feedback" />
        <Button
          variant="outlined"
          disabled={!entries.length}
          onClick={() => navigator.clipboard.writeText(asText).then(() => onToast("Copied to clipboard"), () => onToast("Copy failed"))}
        >
          <Icon name="content_copy" size={18} /> Copy all
        </Button>
      </div>
      {entries.length === 0 && <p className="text-sm text-ink2">No feedback yet. Open any anomaly or document and write in the feedback box.</p>}
      <div className="space-y-3">
        {entries.map((e) => (
          <button key={e.key} onClick={() => onGo(target(e.key))} className="block w-full rounded-xl border border-line p-4 text-left hover:bg-hover">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{label(e.key)}</span>
              <span className="shrink-0 text-xs text-ink2">{time(e.updated_at)}</span>
            </div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-ink2">{e.text}</div>
          </button>
        ))}
      </div>
    </>
  );
}
