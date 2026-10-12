import "server-only";
import { db, must } from "./db";

export interface RequestRow {
  id: string;
  team_id: string;
  question: string;
  doc_ids: string[];
  status: "waiting" | "in_session" | "done" | "skipped" | "cancelled";
  position: number;
  skip_count: number;
  created_at: string;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  expert_note: string | null;
}

export const SESSION_MS = 2 * 60_000;
export const MINUTES_PER_SESSION = 3;

export async function openRequests(): Promise<RequestRow[]> {
  return must(await db().from("expert_requests").select("*").in("status", ["waiting", "in_session"]).order("position")) as RequestRow[];
}

/** Sessions a team has used: completed ones, plus requests cancelled by a second skip. */
export async function usedSessions(teamId?: string): Promise<Map<string, number>> {
  let q = db().from("expert_requests").select("team_id,status").in("status", ["done", "skipped"]);
  if (teamId) q = q.eq("team_id", teamId);
  const rows = must(await q) as { team_id: string }[];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.team_id, (m.get(r.team_id) ?? 0) + 1);
  return m;
}

/** Every team gets one session with Vishal; the admin can grant extras per team. */
export const SESSIONS_PER_TEAM = 1;
export const sessionLimit = (team: { vishal_extra: number }) => SESSIONS_PER_TEAM + (team.vishal_extra ?? 0);

export async function nextPosition() {
  const rows = must(await db().from("expert_requests").select("position").order("position", { ascending: false }).limit(1)) as { position: number }[];
  return (rows[0]?.position ?? 0) + 1;
}

/** Position value that places a request third among those waiting (used after a first skip). */
export function thirdPlace(waiting: RequestRow[]) {
  if (waiting.length < 2) return (waiting[waiting.length - 1]?.position ?? 0) + 1;
  const a = waiting[1].position;
  const b = waiting[2]?.position ?? a + 2;
  return (a + b) / 2;
}
