"use client";

import { useState } from "react";
import { Button, Icon, api } from "../ui";
import type { TeamState } from "./types";

/** Written questions to the Accounts Manager (the CFO character), answered from a scripted bank. */
export function AccountsDesk({ cfo, open, onAsked }: { cfo: TeamState["cfo"]; open: boolean; onAsked: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = cfo.limit - cfo.used;

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/team/cfo", { method: "POST", json: { question: q } });
      setQ("");
      onAsked();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto max-w-[760px] px-4 py-6">
        <div className="flex items-center gap-4 rounded-2xl bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8DEF8] font-medium text-[#4A4458]">PS</div>
          <div>
            <div className="font-display text-xl text-ink">Pranab Saha</div>
            <div className="text-sm text-ink2">Accounts Manager, Himalayan Leaf Traders · answers in writing</div>
          </div>
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${open ? "bg-[#C4EED0] text-[#0D652D]" : "bg-tint text-ink2"}`}>{open ? "Desk open" : "Desk closed"}</span>
        </div>

        <div className="mt-4 space-y-4">
          {cfo.items.map((it) => (
            <div key={it.id} className="space-y-2">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-selected px-4 py-3 text-sm text-[#001D35]">{it.question}</div>
              <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-ink shadow-e1">{it.answer}</div>
            </div>
          ))}
          {cfo.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-outline p-6 text-center text-sm text-ink2">
              You can send {cfo.limit} written questions to the Accounts Manager. He answers straight away. Choose carefully, and judge his answers.
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-white p-4">
          {!open ? (
            <p className="flex items-center gap-2 text-sm text-ink2">
              <Icon name="lock" size={18} /> The Accounts desk is closed right now.
            </p>
          ) : left <= 0 ? (
            <p className="text-sm text-ink2">You have used both questions.</p>
          ) : (
            <>
              <textarea
                value={q}
                onPaste={(e) => e.preventDefault()}
                onChange={(e) => setQ(e.target.value.slice(0, 400))}
                rows={3}
                placeholder={`Question ${cfo.used + 1} of ${cfo.limit}`}
                className="w-full resize-none rounded-lg border border-outline p-3 text-sm outline-none focus:border-2 focus:border-primary"
              />
              {err && <p className="mt-2 text-sm text-danger">{err}</p>}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-ink2">{left} question{left === 1 ? "" : "s"} left</span>
                <Button disabled={busy || q.trim().length < 10} onClick={send}>
                  <Icon name="send" size={18} /> Send
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
