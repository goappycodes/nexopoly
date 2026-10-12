"use client";

import { useState } from "react";
import { LIMITS, wordCount, type Adjustment, type ClearedItem, type Finding, type ManifestDoc, type Phase, type ReportData } from "@/lib/types";
import { Button, Dialog, Icon, IconButton, inr } from "../ui";
import { noPaste } from "./lockdown";

const field = "w-full rounded-md border-0 border-b border-outline bg-[#F8FAFD] px-3 py-2 text-sm text-ink outline-none transition focus:border-b-2 focus:border-primary disabled:text-ink2";

function Words({ text, max }: { text: string; max: number }) {
  const n = wordCount(text);
  return <span className={`text-xs ${n > max ? "text-danger" : "text-ink2"}`}>{n} / {max} words</span>;
}

/** Text input that stops accepting words beyond the limit. */
function LimitedText({ value, onChange, max, rows = 3, disabled, placeholder }: { value: string; onChange: (v: string) => void; max: number; rows?: number; disabled?: boolean; placeholder?: string }) {
  return (
    <div>
      <textarea
        {...noPaste}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (wordCount(v) <= max || v.length < value.length) onChange(v);
        }}
        className={`${field} resize-y leading-6`}
      />
      <div className="mt-1 text-right">
        <Words text={value} max={max} />
      </div>
    </div>
  );
}

function NumberInput({ value, onChange, disabled, placeholder }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; placeholder?: string }) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  return (
    <input
      {...noPaste}
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder ?? "₹ amount"}
      value={raw}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d.-]/g, "");
        setRaw(v);
        const n = v === "" || v === "-" ? null : Number(v);
        onChange(n === null || Number.isNaN(n) ? null : n);
      }}
      onBlur={() => setRaw(value === null ? "" : String(value))}
      className={field}
    />
  );
}

function Section({ n, title, hint, children, locked }: { n: number; title: string; hint?: string; children: React.ReactNode; locked?: string | null }) {
  return (
    <section className="relative rounded-lg border border-line bg-white p-6 focus-within:border-l-[6px] focus-within:border-l-primary focus-within:pl-[19px]">
      <div className="mb-1 flex items-baseline gap-3">
        <span className="font-mono text-sm text-ink2">{n}.</span>
        <h2 className="text-base font-medium text-ink">{title}</h2>
      </div>
      {hint && <p className="mb-4 text-sm text-ink2">{hint}</p>}
      {locked ? (
        <div className="flex items-center gap-2 rounded-lg bg-tint px-4 py-3 text-sm text-ink2">
          <Icon name="lock" size={18} /> {locked}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function DocPicker({ value, onChange, docs, disabled, multiple = true }: { value: string[]; onChange: (v: string[]) => void; docs: ManifestDoc[]; disabled?: boolean; multiple?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className={`${field} flex min-h-[40px] flex-wrap items-center gap-1 text-left`}>
        {value.length === 0 && <span className="text-ink2">{multiple ? "Pick Doc IDs" : "Pick a Doc ID"}</span>}
        {value.map((d) => (
          <span key={d} className="rounded bg-selected px-1.5 py-0.5 font-mono text-xs text-[#001D35]">
            {d}
          </span>
        ))}
        <Icon name="arrow_drop_down" className="ml-auto text-ink2" />
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="scroll-thin absolute z-20 mt-1 max-h-72 w-full min-w-[300px] overflow-auto rounded-lg bg-white py-2 shadow-e3">
            {docs.map((d) => {
              const on = value.includes(d.docId);
              return (
                <button
                  type="button"
                  key={d.docId}
                  onClick={() => {
                    if (multiple) onChange(on ? value.filter((x) => x !== d.docId) : [...value, d.docId]);
                    else {
                      onChange(on ? [] : [d.docId]);
                      setOpen(false);
                    }
                  }}
                  className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-hover"
                >
                  <Icon name={on ? "check_box" : "check_box_outline_blank"} size={20} className={on ? "text-primary" : "text-ink2"} />
                  <span className="w-20 shrink-0 font-mono text-xs text-ink2">{d.docId}</span>
                  <span className="truncate text-ink">{d.title}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Select<T extends string>({ value, options, onChange, disabled, placeholder }: { value: T | ""; options: readonly T[]; onChange: (v: T | "") => void; disabled?: boolean; placeholder: string }) {
  return (
    <select {...noPaste} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value as T)} className={field}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function ReportBuilder({
  report,
  setReport,
  phase,
  status,
  submittedAt,
  autoSubmitted,
  savedAt,
  saving,
  team,
  claimedPbt,
  docs,
  onSubmit,
}: {
  report: ReportData;
  setReport: (fn: (r: ReportData) => ReportData) => void;
  phase: Phase;
  status: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
  savedAt: string | null;
  saving: boolean;
  team: { name: string; members: string[] };
  claimedPbt: number;
  docs: ManifestDoc[];
  onSubmit: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitted = status === "submitted";
  const findingsOpen = !submitted && (phase === "audit" || phase === "report");
  const restOpen = !submitted && phase === "report";
  const restLock = submitted ? null : phase === "audit" ? "Opens when the report phase starts (at 1:05)." : phase === "report" ? null : "The report is locked.";
  const R = (patch: Partial<ReportData>) => setReport((r) => ({ ...r, ...patch }));
  const setFinding = (i: number, patch: Partial<Finding>) => setReport((r) => ({ ...r, findings: r.findings.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const setAdj = (i: number, patch: Partial<Adjustment>) => setReport((r) => ({ ...r, adjustments: r.adjustments.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const setCleared = (i: number, patch: Partial<ClearedItem>) => setReport((r) => ({ ...r, cleared: r.cleared.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const restated = claimedPbt + report.adjustments.reduce((s, a) => s + (a.amount ?? 0) * (a.sign === "+" ? 1 : -1), 0);

  const missing = [
    !report.recommendation && "Recommendation",
    report.cashLeakage === null && "Total cash leakage",
    report.findings.some((f) => f.evidence.length === 0) && "Evidence on every finding",
  ].filter(Boolean) as string[];

  return (
    <div className="scroll-thin h-full overflow-auto bg-[#F0EBF8]/0">
      <div className="mx-auto max-w-[800px] space-y-3 px-4 py-6">
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="h-2.5 bg-primary" />
          <div className="p-6">
            <h1 className="font-display text-[32px] leading-tight text-ink">Due diligence report</h1>
            <p className="mt-2 text-sm text-ink2">
              Fixed template, graded against the answer key. Paste is disabled: type everything here. Cite Doc IDs as evidence. Saves automatically every few seconds.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {submitted ? (
                <span className="flex items-center gap-2 rounded-full bg-[#C4EED0] px-3 py-1 font-medium text-[#0D652D]">
                  <Icon name="task_alt" size={18} /> Submitted{autoSubmitted ? " automatically" : ""} at{" "}
                  {submittedAt && new Date(submittedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-ink2">
                  <Icon name={saving ? "sync" : "cloud_done"} size={18} className={saving ? "animate-spin" : ""} />
                  {saving ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}` : "Not saved yet"}
                </span>
              )}
              {phase === "audit" && !submitted && <span className="rounded-full bg-[#FEF7E0] px-3 py-1 text-[#7A4F01]">Findings are open now. The rest opens at the report phase.</span>}
            </div>
          </div>
        </div>

        <Section n={1} title="Team">
          <div className="text-sm text-ink">
            <span className="font-medium">{team.name}</span> · {team.members.join(", ")}
          </div>
        </Section>

        <Section n={2} title="Executive summary" hint="What an investor needs to know, in 150 words." locked={restLock}>
          <LimitedText value={report.summary} onChange={(v) => R({ summary: v })} max={LIMITS.summaryWords} rows={5} disabled={!restOpen} />
        </Section>

        <Section n={3} title="Recommendation" hint="Required." locked={restLock}>
          <div className="space-y-2">
            {(["Invest at proposed terms", "Invest with conditions", "Walk away"] as const).map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-3 text-sm text-ink">
                <input type="radio" name="rec" disabled={!restOpen} checked={report.recommendation === o} onChange={() => R({ recommendation: o })} className="h-5 w-5 accent-[#0B57D0]" />
                {o}
              </label>
            ))}
          </div>
        </Section>

        <Section n={4} title={`Findings (${report.findings.length}/${LIMITS.findings})`} hint="One row per issue. At least one Doc ID as evidence. Promote notes to add rows with the Doc ID filled in." locked={!findingsOpen && !submitted ? "The report is locked." : null}>
          <div className="space-y-4">
            {report.findings.map((f, i) => (
              <div key={f.id} className="rounded-lg border border-line p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tint text-xs font-medium text-ink2">{i + 1}</span>
                  <input {...noPaste} disabled={!findingsOpen} value={f.title} onChange={(e) => setFinding(i, { title: e.target.value.slice(0, 120) })} placeholder="Finding title" className={`${field} font-medium`} />
                  {findingsOpen && <IconButton icon="delete" title="Remove finding" onClick={() => setReport((r) => ({ ...r, findings: r.findings.filter((_, j) => j !== i) }))} />}
                </div>
                <LimitedText value={f.description} onChange={(v) => setFinding(i, { description: v })} max={LIMITS.findingWords} rows={3} disabled={!findingsOpen} placeholder="What is wrong, and how the documents prove it" />
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-ink2">Evidence (Doc IDs)</div>
                    <DocPicker value={f.evidence} onChange={(v) => setFinding(i, { evidence: v })} docs={docs} disabled={!findingsOpen} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 text-xs text-ink2">Type</div>
                      <Select value={f.type} options={["Error", "Leakage", "Misrepresentation"] as const} onChange={(v) => setFinding(i, { type: v })} disabled={!findingsOpen} placeholder="Type" />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-ink2">Status</div>
                      <Select value={f.status} options={["Proven", "Needs verification"] as const} onChange={(v) => setFinding(i, { status: v })} disabled={!findingsOpen} placeholder="Status" />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-ink2">Rupee impact</div>
                      <NumberInput value={f.impact} onChange={(v) => setFinding(i, { impact: v })} disabled={!findingsOpen} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-ink2">Impact on</div>
                      <Select value={f.impactOn} options={["Profit", "Cash", "Balance sheet", "Not quantified"] as const} onChange={(v) => setFinding(i, { impactOn: v })} disabled={!findingsOpen} placeholder="Impact on" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {findingsOpen && report.findings.length < LIMITS.findings && (
              <Button
                variant="outlined"
                onClick={() =>
                  setReport((r) => ({
                    ...r,
                    findings: [...r.findings, { id: crypto.randomUUID(), title: "", description: "", evidence: [], type: "", status: "", impact: null, impactOn: "" }],
                  }))
                }
              >
                <Icon name="add" size={18} /> Add finding
              </Button>
            )}
          </div>
        </Section>

        <Section n={5} title="Restated profit before tax" hint="Start from management's figure and adjust. The restated figure is calculated for you." locked={restLock}>
          <div className="mb-3 flex items-center justify-between rounded-lg bg-tint px-4 py-2 text-sm">
            <span className="text-ink2">Management&apos;s profit before tax</span>
            <span className="font-mono font-medium">{inr(claimedPbt)}</span>
          </div>
          <div className="space-y-2">
            {report.adjustments.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <select {...noPaste} disabled={!restOpen} value={a.sign} onChange={(e) => setAdj(i, { sign: e.target.value as "+" | "-" })} className={`${field} !w-20`}>
                  <option value="-">−</option>
                  <option value="+">+</option>
                </select>
                <input {...noPaste} disabled={!restOpen} value={a.description} onChange={(e) => setAdj(i, { description: e.target.value.slice(0, 160) })} placeholder="Adjustment" className={field} />
                <div className="w-48 shrink-0">
                  <NumberInput value={a.amount} onChange={(v) => setAdj(i, { amount: v === null ? null : Math.abs(v) })} disabled={!restOpen} />
                </div>
                {restOpen && <IconButton icon="close" title="Remove" onClick={() => setReport((r) => ({ ...r, adjustments: r.adjustments.filter((_, j) => j !== i) }))} />}
              </div>
            ))}
          </div>
          {restOpen && report.adjustments.length < LIMITS.adjustments && (
            <Button variant="text" className="mt-2" onClick={() => setReport((r) => ({ ...r, adjustments: [...r.adjustments, { description: "", amount: null, sign: "-" }] }))}>
              <Icon name="add" size={18} /> Add adjustment
            </Button>
          )}
          <div className={`mt-3 flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium ${restated < 0 ? "bg-[#FCE8E6] text-danger" : "bg-[#E6F4EA] text-success"}`}>
            <span>Restated profit before tax</span>
            <span className="font-mono">{inr(restated)}</span>
          </div>
        </Section>

        <Section n={6} title="Cash" hint="Required." locked={restLock}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-ink2">Total cash leakage found</div>
              <NumberInput value={report.cashLeakage} onChange={(v) => R({ cashLeakage: v })} disabled={!restOpen} />
            </div>
            <div>
              <div className="mb-1 text-xs text-ink2">Operating cash flow after adjustments</div>
              <NumberInput value={report.adjustedOcf} onChange={(v) => R({ adjustedOcf: v })} disabled={!restOpen} />
            </div>
          </div>
        </Section>

        <Section n={7} title="Items examined and cleared" hint="Things that looked suspicious but you judged legitimate, with the Doc ID and your reason." locked={restLock}>
          <div className="space-y-3">
            {report.cleared.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_180px_auto]">
                <input {...noPaste} disabled={!restOpen} value={c.item} onChange={(e) => setCleared(i, { item: e.target.value.slice(0, 160) })} placeholder="Item" className={field} />
                <DocPicker value={c.docId ? [c.docId] : []} onChange={(v) => setCleared(i, { docId: v[0] ?? "" })} docs={docs} disabled={!restOpen} multiple={false} />
                {restOpen ? <IconButton icon="close" title="Remove" onClick={() => setReport((r) => ({ ...r, cleared: r.cleared.filter((_, j) => j !== i) }))} /> : <span />}
                <div className="md:col-span-3">
                  <LimitedText value={c.reason} onChange={(v) => setCleared(i, { reason: v })} max={40} rows={2} disabled={!restOpen} placeholder="Why it is fine" />
                </div>
              </div>
            ))}
          </div>
          {restOpen && report.cleared.length < LIMITS.cleared && (
            <Button variant="text" className="mt-2" onClick={() => setReport((r) => ({ ...r, cleared: [...r.cleared, { item: "", docId: "", reason: "" }] }))}>
              <Icon name="add" size={18} /> Add item
            </Button>
          )}
        </Section>

        <Section n={8} title="Conditions, or what would change our mind" hint="Three rows, 40 words each." locked={restLock}>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <LimitedText
                key={i}
                value={report.conditions[i] ?? ""}
                onChange={(v) => setReport((r) => ({ ...r, conditions: [0, 1, 2].map((j) => (j === i ? v : r.conditions[j] ?? "")) }))}
                max={LIMITS.conditionWords}
                rows={2}
                disabled={!restOpen}
                placeholder={`Condition ${i + 1}`}
              />
            ))}
          </div>
        </Section>

        {restOpen && (
          <div className="flex items-center justify-between py-4">
            <span className="text-sm text-ink2">You can submit once. Unsubmitted drafts are submitted automatically when time runs out.</span>
            <Button onClick={() => setConfirm(true)}>
              <Icon name="send" size={18} /> Submit report
            </Button>
          </div>
        )}
      </div>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Submit your report?">
        <p className="text-sm text-ink2">This locks the report for your team. You can&apos;t edit it afterwards.</p>
        {missing.length > 0 && (
          <div className="mt-4 rounded-lg bg-[#FEF7E0] p-3 text-sm text-[#7A4F01]">
            <div className="mb-1 font-medium">Still missing:</div>
            <ul className="list-disc pl-5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="text" onClick={() => setConfirm(false)}>
            Keep editing
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit();
                setConfirm(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
