import { db, must } from "@/lib/db";
import { handler, requireTeam } from "@/lib/session";
import { getEvent, toPublic, driveAccess } from "@/lib/state";
import { MANIFEST, README_FOLDER, citableIds, CASE_PUBLIC } from "@/lib/manifest";
import { openRequests, usedSessions, sessionLimit, MINUTES_PER_SESSION } from "@/lib/queue";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const team = await requireTeam();
  const e = await getEvent();

  const [open, used, history, reads, report, devices] = await Promise.all([
    openRequests(),
    usedSessions(team.id),
    db().from("expert_requests").select("question,doc_ids,status,expert_note,created_at,ended_at").eq("team_id", team.id).in("status", ["done", "skipped"]).order("created_at"),
    db().from("inbox_reads").select("inject_no").eq("team_id", team.id),
    db().from("reports").select("status,submitted_at,auto_submitted,updated_at").eq("team_id", team.id).maybeSingle(),
    db().from("team_sessions").select("id,member,last_seen_at").eq("team_id", team.id).order("created_at"),
  ]);

  if (!team.last_seen_at || Date.now() - Date.parse(team.last_seen_at) > 15_000) {
    await db().from("teams").update({ last_seen_at: new Date().toISOString() }).eq("id", team.id);
  }
  if (!team.device_seen_at || Date.now() - Date.parse(team.device_seen_at) > 10_000) {
    await db().from("team_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", team.session_id!);
  }

  const waiting = open.filter((r) => r.status === "waiting");
  const mine = open.find((r) => r.team_id === team.id) ?? null;
  const position = mine?.status === "waiting" ? waiting.findIndex((r) => r.id === mine.id) + 1 : null;
  const current = open.find((r) => r.status === "in_session") ?? null;

  const access = driveAccess(e.phase);
  const files = access === "locked" || access === "waiting" ? [] : MANIFEST.filter((d) => !d.inject && (access === "all" || d.folder === README_FOLDER));
  const readSet = new Set((must(reads) as { inject_no: number }[]).map((r) => r.inject_no));
  const inbox = access === "all" && e.inject1_at
    ? MANIFEST.filter((d) => d.inject === 1).map((d) => ({ ...d, modified: e.inject1_at!, read: readSet.has(d.inject!) }))
    : [];

  return {
    state: toPublic(e),
    team: { name: team.name, code: team.code, table_no: team.table_no, members: team.members },
    you: team.member ?? null,
    devices: (must(devices) as { id: string; member: string | null; last_seen_at: string }[]).map((d) => ({
      member: d.member ?? "Teammate",
      me: d.id === team.session_id,
      online: d.id === team.session_id || Date.now() - Date.parse(d.last_seen_at) < 30_000,
    })),
    access,
    files,
    inbox,
    citable: citableIds(),
    claimedPbt: CASE_PUBLIC.claimed_pbt,
    company: CASE_PUBLIC.company,
    vishal: {
      limit: sessionLimit(team),
      used: used.get(team.id) ?? 0,
      request: mine && {
        id: mine.id,
        status: mine.status,
        question: mine.question,
        doc_ids: mine.doc_ids,
        position,
        waitMin: position ? position * MINUTES_PER_SESSION : null,
        endsAt: mine.ends_at,
      },
      queueLength: waiting.length,
      busy: !!current,
      history: must(history),
    },
    report: must(report) ?? { status: "not_started" },
  };
});
