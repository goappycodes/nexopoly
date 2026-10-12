"use client";

import { useEffect, useRef, useState } from "react";
import { PHASES, phaseLabel, type PublicState } from "@/lib/types";
import { Brand, Icon, api, chime, fmtClock, inr, remainingMs, serverNow, useTick } from "@/components/ui";
import { useLive } from "@/components/live";

interface DisplayData {
  state: PublicState;
  queue: { position: number; team: string; table: string; waitingSince: string; estMin: number }[];
  current: { team: string; table: string; endsAt: string } | null;
  justEnded: { team: string; table: string; endedAt: string } | null;
  pitch: null | { index: number; total: number; current: { name: string; table_no: string | null } | null; next: { name: string; table_no: string | null } | null; endsAt: string | null; order: string[] };
  leaderboard: null | { team: string; table: string | null; ai: number; vishal: number; pitch: number; total: number }[];
  reveal: null | {
    claimed: { pbt: number; pat: number; operating_cash_flow: number };
    restated: { pbt: number; cash_leakage: number; operating_cash_flow: number };
    issues: { id: string; level: string; points: number; title: string; must_identify: string; evidence: string[] }[];
    red_herrings: { id: string; title: string }[];
  };
  teamCount: number;
}

export default function Display() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { data, error } = useLive<DisplayData>(authed === false ? "/api/display/state?off" : "/api/display/state", 2000);
  useEffect(() => {
    if (data) setAuthed(true);
    else if (error?.status === 401) setAuthed(false);
  }, [data, error]);

  if (authed === false) return <PinGate onOk={() => location.reload()} />;
  if (!data) return <div className="min-h-screen bg-[#131314]" />;
  return <Screen d={data} />;
}

function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#131314] p-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/auth/display", { method: "POST", json: { pin } });
            onOk();
          } catch (x: any) {
            setErr(x.message);
          }
        }}
        className="w-full max-w-sm rounded-[28px] bg-[#1E1F20] p-8 text-[#E3E3E3]"
      >
        <Brand dark />
        <h1 className="mt-6 font-display text-3xl">Projector</h1>
        <input
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          placeholder="Display PIN"
          className="mt-6 h-14 w-full rounded-lg border border-[#8E918F] bg-transparent px-4 text-lg outline-none focus:border-[#A8C7FA]"
        />
        {err && <p className="mt-3 text-sm text-[#F2B8B5]">{err}</p>}
        <button className="mt-6 h-10 w-full rounded-full bg-[#A8C7FA] font-medium text-[#062E6F]">Open display</button>
      </form>
    </main>
  );
}

function Screen({ d }: { d: DisplayData }) {
  const now = useTick(250);
  const st = d.state;
  const rem = remainingMs(st, now);
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef<{ i1: string | null } | null>(null);

  // "New message received" flash when the inject lands, without content.
  useEffect(() => {
    if (seen.current && st.inject1At && st.inject1At !== seen.current.i1) {
      setFlash("New message received");
      chime();
      setTimeout(() => setFlash(null), 12_000);
    }
    seen.current = { i1: st.inject1At };
  }, [st.inject1At]);

  const clock = new Date(serverNow()).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-[#131314] text-[#E3E3E3]">
      <header className="flex h-24 shrink-0 items-center justify-between px-12">
        <div className="scale-125 origin-left">
          <Brand dark />
        </div>
        <div className="flex items-center gap-8 text-2xl text-[#C4C7C5]">
          <span>NEXIS School of Business · Audit Challenge</span>
          <span className="font-mono tabular-nums text-[#E3E3E3]">{clock}</span>
        </div>
      </header>

      {st.announcement && (
        <div className="mx-12 mb-4 flex items-center gap-5 rounded-3xl bg-[#FDD663] px-8 py-5 text-[#3C2A00]">
          <Icon name="campaign" size={44} />
          <span className="text-[40px] font-medium leading-tight">{st.announcement}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 px-12 pb-10">
        {st.phase === "pitches" ? (
          <Pitches d={d} now={now} />
        ) : st.phase === "reveal" && d.reveal ? (
          <Reveal r={d.reveal} />
        ) : st.phase === "results" ? (
          <Leaderboard rows={d.leaderboard} />
        ) : st.phase === "lobby" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="font-display text-[140px] leading-none">Nexopoly</div>
            <div className="mt-6 text-4xl text-[#C4C7C5]">Himalayan Leaf Traders · audit challenge</div>
            <div className="mt-16 rounded-full bg-[#1E1F20] px-10 py-5 text-3xl">Starting soon · {d.teamCount} teams</div>
          </div>
        ) : (
          <>
            <section className="flex flex-[1.25] flex-col justify-center pr-12">
              <div className="text-[44px] text-[#A8C7FA]">{phaseLabel(st.phase)}</div>
              {rem !== null ? (
                <div className={`font-mono text-[min(22vw,300px)] font-light leading-none tabular-nums ${rem < 60_000 ? "text-[#F2B8B5]" : ""}`}>{fmtClock(rem)}</div>
              ) : (
                <div className="mt-4 font-display text-[96px] leading-none">{st.phase === "closed" ? "Pens down" : "Stand by"}</div>
              )}
              {st.paused && <div className="mt-2 text-4xl text-[#FDD663]">Paused</div>}
              <Timeline phase={st.phase} />
            </section>
            <Queue d={d} now={now} queueOpen={st.queueOpen} />
          </>
        )}
      </div>

      {flash && (
        <div className="anim-in absolute inset-x-0 top-1/3 mx-auto flex w-fit items-center gap-6 rounded-[40px] bg-[#A8C7FA] px-14 py-10 text-[#062E6F] shadow-2xl">
          <Icon name="mark_email_unread" size={80} fill />
          <span className="font-display text-[72px] leading-none">{flash}</span>
        </div>
      )}
    </main>
  );
}

function Timeline({ phase }: { phase: string }) {
  const steps = PHASES.filter((p) => ["briefing", "audit", "report", "closed", "pitches", "results"].includes(p.id));
  const idx = steps.findIndex((p) => p.id === phase);
  return (
    <div className="mt-12 flex gap-3">
      {steps.map((p, i) => (
        <div key={p.id} className="flex-1">
          <div className={`h-2 rounded-full ${i < idx ? "bg-[#A8C7FA]" : i === idx ? "bg-[#E3E3E3]" : "bg-[#444746]"}`} />
          <div className={`mt-3 text-xl ${i === idx ? "text-[#E3E3E3]" : "text-[#8E918F]"}`}>{p.label}</div>
        </div>
      ))}
    </div>
  );
}

function Queue({ d, now, queueOpen }: { d: DisplayData; now: number; queueOpen: boolean }) {
  const cur = d.current;
  const ms = cur ? Date.parse(cur.endsAt) - now : 0;
  const next = d.queue[0];
  return (
    <section className="flex w-[42%] min-w-0 flex-col rounded-[40px] bg-[#1E1F20] p-[min(2.5vw,40px)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-4xl">
          <Icon name="record_voice_over" size={44} className="text-[#A8C7FA]" /> Expert meetings
        </div>
        <span className={`rounded-full px-5 py-2 text-xl ${queueOpen ? "bg-[#0F5223] text-[#C4EED0]" : "bg-[#444746] text-[#C4C7C5]"}`}>{queueOpen ? "Open" : "Closed"}</span>
      </div>

      {cur ? (
        <div className={`mt-8 rounded-[32px] p-8 ${ms <= 0 ? "bg-[#8C1D18]" : "bg-[#0842A0]"}`}>
          <div className="text-[min(1.7vw,26px)] text-[#D3E3FD]">{ms <= 0 ? "Time up" : "Expert at table"}</div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6">
            <div className="min-w-0">
              <div className="whitespace-nowrap font-display text-[min(5vw,96px)] leading-none">Table {cur.table}</div>
              <div className="mt-2 truncate text-[min(2vw,30px)] text-[#D3E3FD]">{cur.team}</div>
            </div>
            <div className="font-mono text-[min(5vw,96px)] leading-none tabular-nums">{fmtClock(ms)}</div>
          </div>
        </div>
      ) : d.justEnded ? (
        <div className="mt-8 rounded-[32px] bg-[#8C1D18] p-8">
          <div className="font-display text-[min(4.5vw,72px)] leading-none">Time up</div>
          <div className="mt-3 text-[min(2vw,30px)] text-[#F9DEDC]">{next ? `Next: Table ${next.table} · ${next.team}` : "Queue is empty"}</div>
        </div>
      ) : (
        next && (
          <div className="mt-8 rounded-[32px] bg-[#2D2F31] p-8">
            <div className="text-2xl text-[#C4C7C5]">Next up</div>
            <div className="mt-2 font-display text-[min(4.5vw,72px)] leading-none">Table {next.table}</div>
            <div className="mt-2 text-3xl text-[#C4C7C5]">{next.team}</div>
          </div>
        )
      )}

      <div className="mt-8 flex-1 space-y-3 overflow-hidden">
        {d.queue.slice(cur || d.justEnded ? 0 : 1, 9).map((q) => (
          <div key={q.position} className="flex items-center gap-4 rounded-2xl bg-[#2D2F31] px-5 py-3 text-[min(1.9vw,30px)]">
            <span className="w-8 font-mono text-[#A8C7FA]">{q.position}</span>
            <span className="whitespace-nowrap font-medium">Table {q.table}</span>
            <span className="min-w-0 flex-1 truncate text-[#C4C7C5]">{q.team}</span>
            <span className="whitespace-nowrap text-right font-mono text-[0.75em] text-[#8E918F]">{Math.max(0, Math.floor((now - Date.parse(q.waitingSince)) / 60000))} min</span>
          </div>
        ))}
        {d.queue.length === 0 && !cur && <div className="pt-10 text-center text-3xl text-[#8E918F]">{queueOpen ? "No one waiting." : "Queue opens soon."}</div>}
      </div>
    </section>
  );
}

function Pitches({ d, now }: { d: DisplayData; now: number }) {
  const p = d.pitch;
  if (!p || !p.current) return <div className="flex flex-1 items-center justify-center font-display text-8xl">Pitches</div>;
  const ms = p.endsAt ? Date.parse(p.endsAt) - now : 120_000;
  const red = p.endsAt && ms <= 15_000;
  return (
    <div className="flex flex-1 gap-12">
      <section className="flex flex-[1.4] flex-col justify-center">
        <div className="text-4xl text-[#A8C7FA]">
          Pitch {p.index + 1} of {p.total}
        </div>
        <div className="mt-4 font-display text-[130px] leading-none">{p.current.name}</div>
        <div className="mt-4 text-4xl text-[#C4C7C5]">Table {p.current.table_no}</div>
        <div className={`mt-10 font-mono text-[260px] font-light leading-none tabular-nums ${red ? "text-[#F2B8B5]" : ""}`}>{fmtClock(ms)}</div>
        {p.endsAt && ms <= 0 && <div className="text-6xl text-[#F2B8B5]">Time</div>}
      </section>
      <section className="flex w-[34%] flex-col rounded-[40px] bg-[#1E1F20] p-10">
        <div className="text-3xl text-[#C4C7C5]">Next</div>
        <div className="mt-2 font-display text-6xl">{p.next?.name ?? "—"}</div>
        <div className="mt-10 space-y-2 overflow-hidden text-2xl">
          {p.order.map((name, i) => (
            <div key={i} className={`flex gap-4 rounded-xl px-4 py-2 ${i === p.index ? "bg-[#0842A0]" : i < p.index ? "text-[#8E918F]" : ""}`}>
              <span className="w-10 font-mono">{i + 1}</span>
              {name}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Reveal({ r }: { r: NonNullable<DisplayData["reveal"]> }) {
  const color: Record<string, string> = { Easy: "bg-[#0F5223]", Medium: "bg-[#7A4F01]", Hard: "bg-[#8C1D18]" };
  return (
    <div className="flex flex-1 gap-10 overflow-hidden">
      <section className="flex w-[30%] flex-col gap-6">
        <div className="font-display text-6xl">The answer</div>
        {[
          ["Profit before tax", r.claimed.pbt, r.restated.pbt],
          ["Operating cash flow", r.claimed.operating_cash_flow, r.restated.operating_cash_flow],
        ].map(([label, a, b]) => (
          <div key={label as string} className="rounded-3xl bg-[#1E1F20] p-6">
            <div className="text-2xl text-[#C4C7C5]">{label}</div>
            <div className="mt-2 text-2xl text-[#8E918F] line-through">{inr(a as number)}</div>
            <div className={`font-mono text-5xl ${(b as number) < 0 ? "text-[#F2B8B5]" : ""}`}>{inr(b as number)}</div>
          </div>
        ))}
        <div className="rounded-3xl bg-[#1E1F20] p-6">
          <div className="text-2xl text-[#C4C7C5]">Cash leaking out</div>
          <div className="font-mono text-5xl text-[#FDD663]">{inr(r.restated.cash_leakage)}</div>
        </div>
        <div className="rounded-3xl bg-[#1E1F20] p-6 text-xl">
          <div className="mb-2 text-2xl text-[#C4C7C5]">Red herrings</div>
          {r.red_herrings.map((h) => (
            <div key={h.id}>✓ {h.title}</div>
          ))}
        </div>
      </section>
      <section className="grid flex-1 grid-cols-2 content-start gap-4 overflow-hidden">
        {r.issues.map((i) => (
          <div key={i.id} className="rounded-2xl bg-[#1E1F20] p-5">
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-base ${color[i.level] ?? "bg-[#444746]"}`}>
                {i.level} · {i.points}
              </span>
              <span className="font-mono text-lg text-[#8E918F]">{i.id}</span>
            </div>
            <div className="mt-2 text-[28px] leading-tight">{i.title}</div>
            <div className="mt-1 font-mono text-base text-[#A8C7FA]">{i.evidence.join(" · ")}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Leaderboard({ rows }: { rows: DisplayData["leaderboard"] }) {
  if (!rows) return <div className="flex flex-1 items-center justify-center font-display text-8xl">Results coming up</div>;
  const medal = ["#FDD663", "#C4C7C5", "#E6A06B"];
  return (
    <div className="flex flex-1 gap-12">
      <section className="flex w-[48%] flex-col justify-center gap-6">
        <div className="font-display text-7xl">Leaderboard</div>
        {rows.slice(0, 3).map((r, i) => (
          <div key={r.team} className="flex items-center gap-8 rounded-[36px] p-8" style={{ background: i === 0 ? "#3C2A00" : "#1E1F20", border: `3px solid ${medal[i]}` }}>
            <span className="font-display text-[96px] leading-none" style={{ color: medal[i] }}>
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="font-display text-6xl">{r.team}</div>
              <div className="mt-1 text-2xl text-[#C4C7C5]">
                Report {r.ai} · Expert {r.vishal} · Pitch {r.pitch}
              </div>
            </div>
            <span className="font-mono text-7xl">{r.total}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-1 flex-col justify-center gap-3">
        {rows.slice(3).map((r, i) => (
          <div key={r.team} className="flex items-center gap-6 rounded-2xl bg-[#1E1F20] px-8 py-4 text-3xl">
            <span className="w-12 font-mono text-[#8E918F]">{i + 4}</span>
            <span className="flex-1">{r.team}</span>
            <span className="font-mono">{r.total}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
