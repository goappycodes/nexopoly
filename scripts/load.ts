// Load test: N teams signed in at once, polling like real laptops and opening pages.
//   npx tsx scripts/load.ts [baseUrl] [teams=15] [seconds=60]
// Needs the event in the audit phase and case pages uploaded for the page fetches.
import { config } from "dotenv";

config({ path: ".env.local" });
const BASE = process.argv[2] ?? "http://localhost:3000";
const N = Number(process.argv[3] ?? 15);
const SECONDS = Number(process.argv[4] ?? 60);

async function login(path: string, body: unknown) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.headers.get("set-cookie")!.split(";")[0];
}

const lat: number[] = [];
let errors = 0;
let netErrors = 0;
async function timed(url: string, cookie: string) {
  const t = Date.now();
  try {
    const r = await fetch(BASE + url, { headers: { cookie } });
    lat.push(Date.now() - t);
    if (!r.ok) errors++;
    return r;
  } catch {
    // Connection resets on this side of the network, not server errors.
    netErrors++;
    return new Response(null, { status: 599 });
  }
}

(async () => {
  const admin = await login("/api/auth/admin", { password: process.env.ADMIN_PASSWORD });
  await fetch(BASE + "/api/admin/action", { method: "POST", headers: { "content-type": "application/json", cookie: admin }, body: JSON.stringify({ action: "setup_teams", count: N }) });
  const ov = await (await fetch(BASE + "/api/admin/overview", { headers: { cookie: admin } })).json();
  const teams = ov.teams.slice(0, N);
  console.log(`signing in ${teams.length} teams at once…`);
  const t0 = Date.now();
  const cookies = await Promise.all(teams.map((t: any, i: number) => login("/api/auth/team", { name: t.name, code: t.code, table: String(i + 1), members: ["Load", "Test", "Bot"] })));
  console.log(`all signed in after ${Date.now() - t0} ms`);

  const end = Date.now() + SECONDS * 1000;
  await Promise.all(
    cookies.map(async (cookie, i) => {
      await new Promise((r) => setTimeout(r, i * 150));
      while (Date.now() < end) {
        const s = await (await timed("/api/team/state", cookie)).json().catch(() => null);
        const doc = s?.files?.[Math.floor(Math.random() * (s?.files?.length || 1))];
        if (doc && Math.random() < 0.5) {
          const p = await (await timed(`/api/team/page?doc=${doc.docId}&p=1`, cookie)).json().catch(() => null);
          if (p?.url) await timed(p.url, cookie);
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    }),
  );
  lat.sort((a, b) => a - b);
  const pct = (p: number) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];
  console.log(`requests ${lat.length}, server errors ${errors}, network drops ${netErrors}, p50 ${pct(50)} ms, p95 ${pct(95)} ms, max ${lat[lat.length - 1]} ms`);
  process.exit(errors ? 1 : 0);
})();
