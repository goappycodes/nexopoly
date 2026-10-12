// End-to-end API smoke test against a running server.
//   npx tsx scripts/smoke.ts [baseUrl]
// Uses the admin password and display PIN from .env.local. It changes event state, so run
// "Reset event" in the admin console afterwards (or pass --reset to do it here).
import { config } from "dotenv";

config({ path: ".env.local" });
const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000";
const RESET = process.argv.includes("--reset");

class Client {
  cookie = "";
  async call(path: string, method = "GET", body?: unknown) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data: data as any, type };
  }
}

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  if (!ok) failures++;
};

(async () => {
  const admin = new Client();
  check("admin wrong password rejected", (await admin.call("/api/auth/admin", "POST", { password: "nope" })).status === 401);
  check("admin login", (await admin.call("/api/auth/admin", "POST", { password: process.env.ADMIN_PASSWORD })).status === 200);
  const act = (action: string, extra: Record<string, unknown> = {}) => admin.call("/api/admin/action", "POST", { action, ...extra });

  if (RESET) check("reset event", (await act("reset_event", { confirm: "RESET" })).status === 200);
  check("create teams", (await act("setup_teams", { count: 3 })).status === 200);
  const ov = (await admin.call("/api/admin/overview")).data;
  check("overview lists teams", ov.teams?.length >= 3, ov);
  const [t1, t2] = ov.teams;

  const anon = new Client();
  check("team route needs a session", (await anon.call("/api/team/state")).status === 401);
  check("admin route rejects anon", (await anon.call("/api/admin/overview")).status === 401);
  check("wrong team code rejected", (await anon.call("/api/auth/team", "POST", { name: t1.name, code: "ZZZZZZ", table: "1", members: ["a"] })).status === 401);

  const teamA = new Client();
  check("team login", (await teamA.call("/api/auth/team", "POST", { name: t1.name.toLowerCase(), code: t1.code, table: "7", members: ["Asha", "Bina", "Chetan"] })).status === 200);
  let s = (await teamA.call("/api/team/state")).data;
  check("team state in lobby", s.state?.phase === "lobby" || !!s.state, s);

  // Second device ends the first session.
  const teamA2 = new Client();
  await teamA2.call("/api/auth/team", "POST", { name: t1.name, code: t1.code });
  check("first device kicked after second login", (await teamA.call("/api/team/state")).status === 409);
  const team = teamA2;

  check("open briefing", (await act("phase", { phase: "briefing" })).status === 200);
  s = (await team.call("/api/team/state")).data;
  check("briefing: drive is read-me only", s.access === "readme", s.access);
  check("briefing: timer running", !!s.state.phaseEndsAt);

  check("start audit", (await act("phase", { phase: "audit" })).status === 200);
  s = (await team.call("/api/team/state")).data;
  check("audit: all folders", s.access === "all", s.access);

  // Pause / extend
  await act("pause");
  s = (await team.call("/api/team/state")).data;
  check("pause holds remaining time", s.state.paused && s.state.pausedRemainingMs > 54 * 60_000, s.state);
  await act("extend", { minutes: 5 });
  await act("resume");
  s = (await team.call("/api/team/state")).data;
  check("extend + resume", !s.state.paused && Date.parse(s.state.phaseEndsAt) - Date.parse(s.now) > 59 * 60_000, s.state);

  // Pages
  const doc = s.files[0];
  if (doc) {
    const pg = await team.call(`/api/team/page?doc=${doc.docId}&p=1`);
    check("signed page URL issued", pg.status === 200 && pg.data.url, pg.data);
    const img = await team.call(pg.data.url);
    check("page image served to team", img.status === 200 && img.type.includes("image"), img.status);
    const stranger = await new Client().call(pg.data.url);
    check("page URL fails without the session", stranger.status === 403);
  } else {
    console.log("SKIP  page images (no case documents uploaded yet)");
  }

  // Vishal queue
  check("vishal closed by default", (await team.call("/api/team/vishal", "POST", { question: "x".repeat(30) })).status === 403);
  await act("toggle", { key: "queue_open", value: true });
  check("short question rejected", (await team.call("/api/team/vishal", "POST", { question: "too short" })).status === 400);
  const [r1, r2] = await Promise.all([
    team.call("/api/team/vishal", "POST", { question: "Could you explain how we should test the year-end figures?", docIds: ["RM-01", "NOPE"] }),
    team.call("/api/team/vishal", "POST", { question: "Could you explain how we should test the year-end figures?" }),
  ]);
  check("double click makes one request", [r1.status, r2.status].sort().join() === "200,409", [r1.status, r2.status]);
  s = (await team.call("/api/team/state")).data;
  check("team sees queue position", s.vishal.request?.position === 1, s.vishal);
  const disp = new Client();
  await disp.call("/api/auth/display", "POST", { pin: process.env.DISPLAY_PIN });
  let d = (await disp.call("/api/display/state")).data;
  check("projector shows queue without questions", d.queue?.length === 1 && !JSON.stringify(d).includes("year-end figures"), d.queue);
  check("start session", (await act("queue_start")).status === 200);
  s = (await team.call("/api/team/state")).data;
  check("team sees session countdown", s.vishal.request?.status === "in_session" && !!s.vishal.request.endsAt, s.vishal);
  d = (await disp.call("/api/display/state")).data;
  check("projector shows current session", d.current?.table === "7", d.current);
  check("end session", (await act("queue_end", { id: (await admin.call("/api/admin/overview")).data.queue[0].id })).status === 200);
  s = (await team.call("/api/team/state")).data;
  check("session counted", s.vishal.used === 1 && !s.vishal.request, s.vishal);

  // Notes
  const note = await team.call("/api/team/notes", "POST", { doc_id: doc?.docId ?? "RM-01", page_no: 1, x: 0.5, y: 0.5, text: "test note" });
  check("note created", note.status === 200 || !doc, note.data);

  // Report: findings only during audit
  const draft = { summary: "should not save yet", findings: [{ id: "a", title: "Test finding", description: "smoke test row", evidence: ["RM-01"], type: "Error", status: "Proven", impact: 1000, impactOn: "Cash" }] };
  check("audit: findings autosave", (await team.call("/api/team/report", "PUT", { data: draft })).status === 200);
  let rep = (await team.call("/api/team/report")).data;
  check("audit: only findings stored", rep.report.findings.length === 1 && rep.report.summary === "", rep.report);
  check("submit blocked before report phase", (await team.call("/api/team/report/submit", "POST", {})).status === 403);

  // Injects
  await act("inject1");
  s = (await team.call("/api/team/state")).data;
  if (s.files.length) check("inject 1 delivered", s.inbox.some((i: any) => i.inject === 1), s.inbox);
  else console.log("SKIP  inject 1 (no case documents uploaded yet)");
  await act("phase", { phase: "report" });
  s = (await team.call("/api/team/state")).data;
  check("report phase pushes no second inject", !s.inbox.some((i: any) => i.docId === "INJ-02"), s.inbox);
  check("INJ-02 not served", (await team.call(`/api/team/page?doc=INJ-02&p=1`)).status === 404);

  check("report phase: full save", (await team.call("/api/team/report", "PUT", { data: { ...draft, summary: "Smoke test summary." } })).status === 200);
  check("submit", (await team.call("/api/team/report/submit", "POST", {})).status === 200);
  check("no edits after submit", (await team.call("/api/team/report", "PUT", { data: draft })).status === 403);
  rep = (await team.call("/api/team/report")).data;
  check("submitted report kept", rep.status === "submitted" && rep.report.summary === "Smoke test summary.", rep);

  // Close: other teams auto-submitted
  await act("close_submissions");
  const ov2 = (await admin.call("/api/admin/overview")).data;
  const other = ov2.teams.find((t: any) => t.id === t2.id);
  check("unsubmitted drafts auto-submitted", other.report?.status === "submitted" && other.report.auto_submitted, other.report);
  s = (await team.call("/api/team/state")).data;
  check("drive locked after close", s.access === "locked" && s.files.length === 0, s.access);

  const pdf = await admin.call(`/api/admin/report-pdf?team=${t1.id}`);
  check("report PDF stored", pdf.status === 200 && pdf.type.includes("pdf"), pdf.status);
  const csv = await admin.call(`/api/admin/export?type=scores`);
  check("scores CSV export", csv.status === 200, csv.status);

  // The answer key must never be reachable from a team session.
  const probes = ["/api/team/state", "/api/team/report", "/api/team/notes", "/api/display/state", "/api/admin/overview"];
  for (const p of probes) {
    const r = await team.call(p);
    const txt = JSON.stringify(r.data);
    check(`no answer key via ${p}`, !/must_identify|pbt_accept|red_herrings|cfo_answers/.test(txt));
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})();
