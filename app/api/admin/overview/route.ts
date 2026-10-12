import { db, must } from "@/lib/db";
import { handler, requireAdmin } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { sessionLimit, usedSessions } from "@/lib/queue";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  const e = await getEvent();
  const [teams, stats, reports, scores, requests, used, devices] = await Promise.all([
    db().from("teams").select("*").order("name"),
    db().from("team_stats").select("*"),
    db().from("reports").select("team_id,status,submitted_at,auto_submitted,updated_at"),
    db().from("team_scores").select("*"),
    db().from("expert_requests").select("*").order("position"),
    usedSessions(),
    db().from("team_sessions").select("team_id,member,last_seen_at").order("created_at"),
  ]);
  const byId = <T extends { team_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.team_id, r]));
  const statMap = byId(must(stats) as any[]);
  const repMap = byId(must(reports) as any[]);
  const scoreMap = byId(must(scores) as any[]);
  const allReq = must(requests) as any[];
  const names = new Map((must(teams) as any[]).map((t) => [t.id, t]));

  const done = allReq.filter((r) => r.status === "done" && r.started_at && r.ended_at);
  const avgSessionSec = done.length
    ? Math.round(done.reduce((s, r) => s + (Date.parse(r.ended_at) - Date.parse(r.started_at)), 0) / done.length / 1000)
    : null;

  return {
    event: e,
    teams: (must(teams) as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      table_no: t.table_no,
      members: t.members,
      online: !!t.last_seen_at && Date.now() - Date.parse(t.last_seen_at) < 30_000,
      devices: (must(devices) as any[])
        .filter((d) => d.team_id === t.id)
        .map((d) => ({ member: d.member ?? "Laptop", online: Date.now() - Date.parse(d.last_seen_at) < 30_000 })),
      last_seen_at: t.last_seen_at,
      vishal_used: used.get(t.id) ?? 0,
      vishal_limit: sessionLimit(t),
      stats: statMap.get(t.id) ?? null,
      report: repMap.get(t.id) ?? null,
      score: scoreMap.get(t.id) ?? null,
    })),
    queue: allReq
      .filter((r) => ["waiting", "in_session"].includes(r.status))
      .map((r) => ({ ...r, team_name: names.get(r.team_id)?.name, table_no: names.get(r.team_id)?.table_no })),
    recentSessions: allReq
      .filter((r) => ["done", "skipped", "cancelled"].includes(r.status))
      .sort((a, b) => Date.parse(b.ended_at ?? b.created_at) - Date.parse(a.ended_at ?? a.created_at))
      .slice(0, 12)
      .map((r) => ({ ...r, team_name: names.get(r.team_id)?.name, table_no: names.get(r.team_id)?.table_no })),
    avgSessionSec,
  };
});
