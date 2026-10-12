import { NextResponse } from "next/server";
import JSZip from "jszip";
import { db, must } from "@/lib/db";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

const file = (body: BodyInit, type: string, name: string) =>
  new NextResponse(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const s = await readSession();
  if (s?.role !== "admin") return new NextResponse("Admin only", { status: 401 });
  const type = new URL(req.url).searchParams.get("type");
  const teams = must(await db().from("teams").select("*").order("name")) as any[];
  const name = new Map(teams.map((t) => [t.id, t.name]));

  if (type === "pdfs") {
    const zip = new JSZip();
    for (const t of teams) {
      const { data } = await db().storage.from("reports").download(`${t.id}.pdf`);
      if (data) zip.file(`${t.name.replace(/[^\w-]+/g, "_")}.pdf`, new Uint8Array(await data.arrayBuffer()));
    }
    return file(new Uint8Array(await zip.generateAsync({ type: "uint8array" })), "application/zip", "nexopoly-reports.zip");
  }
  if (type === "json") {
    const reports = must(await db().from("reports").select("*")) as any[];
    const out = reports.map((r) => ({ team: name.get(r.team_id), status: r.status, submitted_at: r.submitted_at, auto_submitted: r.auto_submitted, report: r.data }));
    return file(JSON.stringify(out, null, 2), "application/json", "nexopoly-reports.json");
  }
  if (type === "scores") {
    const scores = must(await db().from("team_scores").select("*")) as any[];
    const map = new Map(scores.map((x) => [x.team_id, x]));
    const rows: (string | number | null)[][] = [["Team", "Table", "Members", "AI (avg of 2 runs)", "Run variance", "Needs review", "Accepted", "Final AI", "Edit reason", "Pitch", "Total"]];
    for (const t of teams) {
      const sc = map.get(t.id) ?? {};
      const ai = sc.final_ai ?? sc.ai_total ?? null;
      rows.push([t.name, t.table_no, (t.members ?? []).join("; "), sc.ai_total, sc.variance, sc.needs_review ? "yes" : "", sc.accepted ? "yes" : "", sc.final_ai, sc.edit_reason, sc.pitch_marks, ai === null && sc.pitch_marks == null ? null : Number(ai ?? 0) + Number(sc.pitch_marks ?? 0)]);
    }
    return file(csv(rows), "text/csv", "nexopoly-scores.csv");
  }
  if (type === "activity") {
    const logs = must(await db().from("activity_log").select("*").order("created_at").limit(50000)) as any[];
    const rows = [["Time", "Team", "Event", "Doc", "Detail"], ...logs.map((l) => [l.created_at, name.get(l.team_id) ?? "", l.event_type, l.doc_id, l.detail ? JSON.stringify(l.detail) : ""])];
    return file(csv(rows), "text/csv", "nexopoly-activity.csv");
  }
  return new NextResponse("Unknown export", { status: 400 });
}
