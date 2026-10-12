"use client";

import { useState } from "react";
import type { ManifestDoc } from "@/lib/types";
import { Button, Dialog, Icon, api, fmtClock, useTick } from "../ui";
import type { TeamState } from "./types";

export function AskVishalDialog({ open, onClose, docs, vishal, queueOpen, onDone }: { open: boolean; onClose: () => void; docs: ManifestDoc[]; vishal: TeamState["vishal"]; queueOpen: boolean; onDone: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = vishal.limit - vishal.used;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/team/vishal", { method: "POST", json: { question: q, docIds: ids } });
      setQ("");
      setIds([]);
      onClose();
      onDone("You're in Vishal's queue.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Ask Vishal" width={620}>
      <p className="text-sm leading-6 text-ink2">
        Vishal Jain is a forensic finance expert. He walks to your table for a <b>2-minute</b> session. You have <b>{left}</b> of {vishal.limit} sessions left.
        Type your question first, so he knows what you need before he arrives. Vague questions get a question back.
      </p>
      {!queueOpen ? (
        <div className="mt-4 rounded-lg bg-tint p-4 text-sm text-ink2">The queue is closed right now.</div>
      ) : left <= 0 ? (
        <div className="mt-4 rounded-lg bg-tint p-4 text-sm text-ink2">You have used all your sessions.</div>
      ) : vishal.request ? (
        <div className="mt-4 rounded-lg bg-tint p-4 text-sm text-ink2">You already have a request in the queue.</div>
      ) : (
        <>
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 600))}
            onPaste={(e) => e.preventDefault()}
            rows={4}
            autoFocus
            placeholder="Your question (at least 20 characters)"
            className="mt-4 w-full resize-none rounded-lg border border-outline bg-white p-3 text-sm outline-none focus:border-2 focus:border-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-ink2">
            <span>{q.trim().length < 20 ? `${20 - q.trim().length} more characters needed` : "Ready"}</span>
            <span>{q.length}/600</span>
          </div>
          <div className="mt-4 text-sm font-medium text-ink">Related documents (optional)</div>
          <div className="scroll-thin mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
            {docs.map((d) => {
              const on = ids.includes(d.docId);
              return (
                <button
                  key={d.docId}
                  title={d.title}
                  onClick={() => setIds(on ? ids.filter((x) => x !== d.docId) : [...ids, d.docId])}
                  className={`rounded-lg border px-2 py-1 font-mono text-xs ${on ? "border-transparent bg-selected text-[#001D35]" : "border-outline text-ink2 hover:bg-hover"}`}
                >
                  {d.docId}
                </button>
              );
            })}
          </div>
          {vishal.queueLength > 0 && <p className="mt-4 text-xs text-ink2">{vishal.queueLength} team(s) waiting. Expect about {(vishal.queueLength + 1) * 3} minutes.</p>}
        </>
      )}
      {err && <p className="mt-3 rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-danger">{err}</p>}
      {vishal.history.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 text-sm font-medium text-ink">Your past sessions</div>
          <div className="space-y-2">
            {vishal.history.map((h, i) => (
              <div key={i} className="rounded-lg bg-tint p-3 text-sm">
                <div className="text-ink">{h.question}</div>
                {h.expert_note && <div className="mt-1 text-ink2">Vishal: {h.expert_note}</div>}
                {h.status === "skipped" && <div className="mt-1 text-xs text-danger">Missed (skipped twice)</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
        {queueOpen && left > 0 && !vishal.request && (
          <Button disabled={busy || q.trim().length < 20} onClick={submit}>
            Join the queue
          </Button>
        )}
      </div>
    </Dialog>
  );
}

/** Drive-style progress card, bottom right: queue position, live session countdown, time up. */
export function VishalPanel({ vishal, onCancel }: { vishal: TeamState["vishal"]; onCancel: () => void }) {
  const now = useTick(500);
  const [hidden, setHidden] = useState<string | null>(null);
  const r = vishal.request;
  const last = vishal.history[vishal.history.length - 1];
  const justEnded = (!r && last?.status === "done" && last.ended_at && now - Date.parse(last.ended_at) < 30_000) || (r?.status === "in_session" && r.endsAt && Date.parse(r.endsAt) <= now);
  const key = r ? `${r.id}:${r.status}` : justEnded ? `end:${last!.ended_at}` : null;
  if (!key || hidden === key) return null;

  let body: React.ReactNode;
  if (r?.status === "in_session" && r.endsAt && Date.parse(r.endsAt) > now) {
    const ms = Date.parse(r.endsAt) - now;
    body = (
      <div className="p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-success">
          <span className="pulse h-2.5 w-2.5 rounded-full bg-success" /> Vishal is with you
        </div>
        <div className={`mt-1 font-display text-5xl tabular-nums ${ms < 20_000 ? "text-danger" : "text-ink"}`}>{fmtClock(ms)}</div>
        <div className="mt-3 rounded-lg bg-tint p-3 text-[15px] leading-6 text-ink">{r.question}</div>
        {r.doc_ids.length > 0 && <div className="mt-2 font-mono text-xs text-ink2">{r.doc_ids.join(" · ")}</div>}
      </div>
    );
  } else if (r?.status === "waiting") {
    body = (
      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl text-primary">#{r.position}</span>
          <span className="text-sm text-ink2">in the queue · about {r.waitMin} min</span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-ink2">{r.question}</p>
        <div className="mt-3 flex justify-end">
          <Button variant="text" onClick={onCancel}>
            Cancel request
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="p-4 text-center">
        <Icon name="timer_off" size={40} className="text-danger" />
        <div className="mt-1 font-display text-3xl text-danger">Time up</div>
        <p className="mt-1 text-sm text-ink2">Vishal is moving to the next team.</p>
      </div>
    );
  }

  return (
    <div className="anim-in fixed bottom-6 right-6 z-40 w-[360px] overflow-hidden rounded-2xl bg-white shadow-e3">
      <div className="flex h-12 items-center justify-between bg-[#F0F4F9] px-4">
        <span className="text-sm font-medium text-ink">Session with Vishal</span>
        <button onClick={() => setHidden(key)} className="rounded-full p-1 text-ink2 hover:bg-hover" title="Hide">
          <Icon name="close" size={20} />
        </button>
      </div>
      {body}
    </div>
  );
}
