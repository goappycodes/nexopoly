import { db, must } from "@/lib/db";
import { handler, requireDisplay } from "@/lib/session";
import { getEvent, toPublic } from "@/lib/state";
import { openRequests, MINUTES_PER_SESSION } from "@/lib/queue";
import { answerKey } from "@/lib/answerKey";

export const dynamic = "force-dynamic";

/** Projector view. Never includes questions, so teams can't read each other's leads. */
export const GET = handler(async () => {
  await requireDisplay();
  const e = await getEvent();
  const teams = must(await db().from("teams").select("id,name,table_no")) as { id: string; name: string; table_no: string | null }[];
  const t = new Map(teams.map((x) => [x.id, x]));
  const open = await openRequests();
  const lastDone = must(
    await db().from("expert_requests").select("team_id,ended_at").eq("status", "done").order("ended_at", { ascending: false }).limit(1),
  ) as { team_id: string; ended_at: string }[];

  const queue = open
    .filter((r) => r.status === "waiting")
    .map((r, i) => ({ position: i + 1, team: t.get(r.team_id)?.name ?? "?", table: t.get(r.team_id)?.table_no ?? "?", waitingSince: r.created_at, estMin: (i + 1) * MINUTES_PER_SESSION }));
  const cur = open.find((r) => r.status === "in_session");
  const current = cur ? { team: t.get(cur.team_id)?.name, table: t.get(cur.team_id)?.table_no, endsAt: cur.ends_at } : null;
  const justEnded =
    !cur && lastDone[0] && Date.now() - Date.parse(lastDone[0].ended_at) < 25_000
      ? { team: t.get(lastDone[0].team_id)?.name, table: t.get(lastDone[0].team_id)?.table_no, endedAt: lastDone[0].ended_at }
      : null;

  const pitch =
    e.phase === "pitches" && e.pitch_order.length
      ? {
          index: e.pitch_index,
          total: e.pitch_order.length,
          current: t.get(e.pitch_order[e.pitch_index]) ?? null,
          next: t.get(e.pitch_order[e.pitch_index + 1]) ?? null,
          endsAt: e.pitch_ends_at,
          order: e.pitch_order.map((id) => t.get(id)?.name ?? "?"),
        }
      : null;

  let leaderboard = null;
  if (e.leaderboard_published) {
    const scores = must(await db().from("team_scores").select("*")) as any[];
    leaderboard = scores
      .map((s) => ({ team: t.get(s.team_id)?.name ?? "?", table: t.get(s.team_id)?.table_no, ai: Number(s.final_ai ?? s.ai_total ?? 0), pitch: Number(s.pitch_marks ?? 0) }))
      .map((r) => ({ ...r, total: Math.round((r.ai + r.pitch) * 10) / 10 }))
      .sort((a, b) => b.total - a.total);
  }

  let reveal = null;
  if (e.phase === "reveal") {
    try {
      const k = await answerKey();
      reveal = {
        claimed: k.claimed,
        restated: { pbt: k.restated.pbt, cash_leakage: k.restated.cash_leakage, operating_cash_flow: k.restated.operating_cash_flow },
        issues: k.issues.map((i) => ({ id: i.id, level: i.level, points: i.points, title: i.title, must_identify: i.must_identify, evidence: i.evidence_strong })),
        red_herrings: k.red_herrings.map((r) => ({ id: r.id, title: r.title })),
      };
    } catch {}
  }

  return { state: toPublic(e), queue, current, justEnded, pitch, leaderboard, reveal, teamCount: teams.length };
});
