"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/ui";

/** Printable login cards, 6 per A4 page. Admin only (the API rejects anyone else). */
export default function Cards() {
  const [teams, setTeams] = useState<any[] | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(location.origin.replace(/^https?:\/\//, ""));
    api("/api/admin/overview").then((d) => setTeams(d.teams)).catch(() => setTeams([]));
  }, []);
  if (!teams) return <p className="p-8">Loading…</p>;
  return (
    <div className="bg-white p-6 print:p-0">
      <style>{`@page { size: A4; margin: 10mm } @media print { .noprint { display: none } }`}</style>
      <div className="noprint mb-6 flex items-center gap-4">
        <button onClick={() => window.print()} className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-white">Print cards</button>
        <span className="text-sm text-ink2">{teams.length} cards · cut along the dashed lines</span>
      </div>
      <div className="grid grid-cols-2 gap-0">
        {teams.map((t) => (
          <div key={t.id} className="flex h-[88mm] flex-col border border-dashed border-[#999] p-6" style={{ breakInside: "avoid" }}>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/nexis-logo-dark.png" alt="NEXIS" className="h-6" />
              <span className="ml-auto text-sm text-ink2">Nexopoly · Audit Challenge</span>
            </div>
            <div className="mt-5 text-xs uppercase tracking-widest text-ink2">Team</div>
            <div className="font-display text-3xl">{t.name}</div>
            <div className="mt-4 text-xs uppercase tracking-widest text-ink2">Code</div>
            <div className="font-mono text-4xl tracking-[0.3em]">{t.code}</div>
            <div className="mt-auto flex items-end justify-between text-sm">
              <div>
                Table no. <span className="inline-block w-20 border-b border-ink">&nbsp;</span>
              </div>
              <div className="text-right text-xs text-ink2">
                Sign in at <b className="text-ink">{origin}</b>
                <br />
                One laptop per team · phones in bags · no AI tools
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
