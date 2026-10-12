import { db, must } from "@/lib/db";
import { handler, requireTeam } from "@/lib/session";
import { getEvent, toPublic, driveAccess } from "@/lib/state";
import { MANIFEST, README_FOLDER, citableIds, CASE_PUBLIC } from "@/lib/manifest";
import { openRequests, usedSessions, sessionLimit, MINUTES_PER_SESSION } from "@/lib/queue";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const team = await requireTeam();
  const e = await getEvent();

  const [open, used, history, cfo, reads, report] = await Promise.all([
    openRequests(),
    usedSessions(team.id),
    db().from("expert_requests").select("question,doc_ids,status,expert_note,created_at,ended_at").eq("team_id", team.id).in("status", ["done", "skipped"]).order("created_at"),
    db().from("cfo_questions").select("id,question,answer,created_at").eq("team_id", team.id).order("created_at"),
    db().from("inbox_reads").select("inject_no").eq("team_id", team.id),
    db().from("reports").select("status,submitted_at,auto_submitted,updated_at").eq("team_id", team.id).maybeSingle(),
  ]);

  if (!team.last_seen_at || Date.now() - Date.parse(team.last_seen_at) > 15_000) {
    await db().from("teams").update({ last_seen_at: new Date().toISOString() }).eq("id", team.id);
  }

  const waiting = open.filter((r) => r.status === "waiting");
  const mine = open.find((r) => r.team_id === team.id) ?? null;
  const position = mine?.status === "waiting" ? waiting.findIndex((r) => r.id === mine.id) + 1 : null;
  const current = open.find((r) => r.status === "in_session") ?? null;

  const access = driveAccess(e.phase);
  const files = access === "locked" ? [] : MANIFEST.filter((d) => !d.inject && (access === "all" || d.folder === README_FOLDER));
  const readSet = new Set((must(reads) as { inject_no: number }[]).map((r) => r.inject_no));
  const inbox = access === "all" && e.inject1_at
    ? MANIFEST.filter((d) => d.inject === 1).map((d) => ({ ...d, modified: e.inject1_at!, read: readSet.has(d.inject!) }))
    : [];

  return {
    state: toPublic(e),
    team: { name: team.name, code: team.code, table_no: team.table_no, members: team.members },
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
    cfo: { used: (must(cfo) as unknown[]).length, limit: 2, items: must(cfo) },
    report: must(report) ?? { status: "not_started" },
  };
});
