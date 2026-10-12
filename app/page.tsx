"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, Button, TextField, api } from "@/components/ui";

export default function TeamLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [table, setTable] = useState("");
  const [you, setYou] = useState("");
  const [members, setMembers] = useState(["", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/team", { method: "POST", json: { name, code, you, table, members } });
      router.replace("/drive");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-tint p-4">
      <form onSubmit={submit} className="w-full max-w-[1040px] rounded-[28px] bg-white p-9 md:flex md:gap-10 md:p-12" style={{ ["--field-bg" as any]: "#fff" }}>
        <div className="md:w-1/2">
          <Brand />
          <h1 className="mt-8 font-display text-[36px] leading-tight text-ink">Sign in</h1>
          <p className="mt-3 text-base text-ink">to open your team&apos;s case files</p>
          <p className="mt-6 max-w-sm text-sm leading-6 text-ink2">
            Use the team name and 6-character code on your login card. Each member can sign in on their own laptop; your team shares notes and one report.
          </p>
        </div>
        <div className="mt-8 space-y-5 md:mt-0 md:w-1/2">
          <TextField label="Team name" value={name} onChange={setName} autoFocus />
          <TextField label="Team code" value={code} onChange={(v) => setCode(v.toUpperCase())} maxLength={6} />
          <TextField label="Your name" value={you} onChange={setYou} />
          <TextField label="Table number" value={table} onChange={setTable} inputMode="numeric" maxLength={6} />
          <div className="grid gap-3">
            {members.map((m, i) => (
              <TextField key={i} label={`Member ${i + 1}`} value={m} onChange={(v) => setMembers(members.map((x, j) => (j === i ? v : x)))} />
            ))}
          </div>
          <p className="text-xs text-ink2">Table number and member names are needed only the first time someone from your team signs in.</p>
          {error && <p className="rounded-lg bg-[#FCE8E6] px-4 py-3 text-sm text-danger">{error}</p>}
          <div className="flex items-center justify-end pt-2">
            <Button type="submit" disabled={busy || !name || code.length < 6 || !you.trim()}>
              {busy ? "Signing in…" : "Next"}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
