// Multi-laptop check against a running server, using one temporary team that is deleted at the end.
//   npx tsx scripts/multi-device-test.ts [baseUrl]
// Needs the event in the audit phase. Does not touch any other team.
import { config } from "dotenv";

config({ path: ".env.local" });
const BASE = process.argv[2] ?? "http://localhost:3000";
let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  if (!ok) failures++;
};

async function client() {
  let cookie = "";
  return {
    async call(path: string, method = "GET", body?: unknown) {
      const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return { status: r.status, data: (await r.json().catch(() => ({}))) as any };
    },
  };
}

(async () => {
  const admin = await client();
  await admin.call("/api/auth/admin", "POST", { password: process.env.ADMIN_PASSWORD });
  const before = (await admin.call("/api/admin/overview")).data;
  check("event is in the audit phase", before.event.phase === "audit", before.event.phase);
  const limit = before.event.devices_per_team ?? 3;
  await admin.call("/api/admin/action", "POST", { action: "setup_teams", count: before.teams.length + 1 });
  const after = (await admin.call("/api/admin/overview")).data;
  const t = after.teams.find((x: any) => !before.teams.some((y: any) => y.id === x.id));
  check("temporary team created", !!t);
  if (!t) process.exit(1);

  try {
    const login = async (you: string) => {
      const c = await client();
      const r = await c.call("/api/auth/team", "POST", { name: t.name, code: t.code, you, table: "99", members: ["Asha", "Bina", "Chetan"] });
      check(`${you} signs in`, r.status === 200, r.data);
      return c;
    };
    const a = await login("Asha");
    const b = await login("Bina");
    const sa = (await a.call("/api/team/state")).data;
    const sb = (await b.call("/api/team/state")).data;
    check("both laptops stay signed in", !!sa.state && !!sb.state, [sa.error, sb.error]);
    check("teammates listed", sb.devices?.length === 2 && sb.you === "Bina", sb.devices);

    const note = await a.call("/api/team/notes", "POST", { doc_id: "RM-01", page_no: 1, x: 0.2, y: 0.2, text: "Asha's note" });
    const bNotes = (await b.call("/api/team/notes")).data.notes;
    check("Bina sees Asha's note with author", bNotes.some((n: any) => n.id === note.data.note.id && n.author === "Asha"), bNotes);

    const row = (id: string, title: string) => ({ id, title, description: "", evidence: ["RM-01"], type: "", status: "", impact: null, impactOn: "" });
    const [r1, r2] = await Promise.all([
      a.call("/api/team/report", "PUT", { patch: { findings: [row("fa", "From Asha")] } }),
      b.call("/api/team/report", "PUT", { patch: { findings: [row("fb", "From Bina")] } }),
    ]);
    check("simultaneous saves both succeed", r1.status === 200 && r2.status === 200, [r1.data, r2.data]);
    let rep = (await a.call("/api/team/report")).data.report;
    check("both findings kept", rep.findings.map((f: any) => f.id).sort().join() === "fa,fb", rep.findings);
    await b.call("/api/team/report", "PUT", { patch: { findings: [{ ...row("fa", "Edited by Bina") }] } });
    await a.call("/api/team/report", "PUT", { patch: { deleted: ["fb"] } });
    rep = (await b.call("/api/team/report")).data.report;
    check("edit and delete merge", rep.findings.length === 1 && rep.findings[0].title === "Edited by Bina", rep.findings);

    // Going over the limit signs out the oldest laptop (Asha).
    const extra = [];
    for (let i = 2; i < limit; i++) extra.push(await login(`Extra${i}`));
    await login("OneTooMany");
    check(`oldest laptop signed out past ${limit}`, (await a.call("/api/team/state")).status === 409);
    check("newer laptop still signed in", (await b.call("/api/team/state")).status === 200 || limit < 3);
    const log = (await admin.call(`/api/admin/activity?team=${t.id}`)).data.rows;
    check("sign-out logged for admin", log.some((r: any) => r.event_type === "second_login"), log.map((r: any) => r.event_type));
  } finally {
    await admin.call("/api/admin/action", "POST", { action: "delete_team", teamId: t.id });
    console.log("temporary team deleted");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})();
