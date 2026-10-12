import "server-only";
import { db, must, ping } from "./db";
import type { Phase, PublicState } from "./types";
import { autoSubmitAll } from "./reports";

export interface EventRow {
  id: number;
  phase: Phase;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  paused: boolean;
  paused_remaining_ms: number | null;
  queue_open: boolean;
  inject1_at: string | null;
  announcement: string | null;
  announcement_at: string | null;
  pitch_order: string[];
  pitch_index: number;
  pitch_ends_at: string | null;
  pitch_paused_remaining_ms: number | null;
  leaderboard_published: boolean;
}

export const toPublic = (e: EventRow): PublicState => ({
  phase: e.phase,
  phaseEndsAt: e.phase_ends_at,
  paused: e.paused,
  pausedRemainingMs: e.paused_remaining_ms,
  queueOpen: e.queue_open,
  inject1At: e.inject1_at,
  announcement: e.announcement,
  announcementAt: e.announcement_at,
});

let lastTick = 0;

/**
 * Time-driven transitions, run lazily on reads (there is no background worker on Vercel).
 * Each transition is a conditional update, so concurrent callers apply it once.
 */
export async function tick() {
  if (Date.now() - lastTick < 1000) return;
  lastTick = Date.now();
  const now = new Date().toISOString();

  const ended = must(
    await db().from("expert_requests").update({ status: "done", ended_at: now }).eq("status", "in_session").lte("ends_at", now).select("id"),
  );
  if (ended.length) await ping("queue");

  const closed = must(
    await db()
      .from("event_state")
      .update({ phase: "closed", phase_started_at: now, phase_ends_at: null, paused: false, queue_open: false, updated_at: now })
      .eq("id", 1)
      .eq("phase", "report")
      .eq("paused", false)
      .lte("phase_ends_at", now)
      .select("id"),
  );
  if (closed.length) {
    await autoSubmitAll();
    await ping("state");
  }
}

export async function getEvent(): Promise<EventRow> {
  await tick();
  return must(await db().from("event_state").select("*").eq("id", 1).single()) as EventRow;
}

export async function updateEvent(patch: Partial<EventRow>) {
  must(await db().from("event_state").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1));
  await ping("state");
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Moves the event to a phase, with the brief's default duration for timed phases. */
export async function setPhase(phase: Phase) {
  const now = new Date().toISOString();
  const patch: Partial<EventRow> = { phase, phase_started_at: now, paused: false, paused_remaining_ms: null, phase_ends_at: null };
  if (phase === "briefing") patch.phase_ends_at = inMinutes(10);
  if (phase === "audit") {
    patch.phase_ends_at = inMinutes(55);
    patch.queue_open = true;
  }
  if (phase === "report") {
    patch.phase_ends_at = inMinutes(15);
  }
  if (phase === "closed") {
    patch.queue_open = false;
  }
  if (phase === "pitches") {
    patch.pitch_ends_at = null;
    patch.pitch_paused_remaining_ms = null;
  }
  await updateEvent(patch);
  if (phase === "closed") await autoSubmitAll();
}

export async function pausePhase() {
  const e = await getEvent();
  if (e.paused || !e.phase_ends_at) return;
  await updateEvent({ paused: true, paused_remaining_ms: Math.max(0, Date.parse(e.phase_ends_at) - Date.now()), phase_ends_at: null });
}

export async function resumePhase() {
  const e = await getEvent();
  if (!e.paused) return;
  await updateEvent({ paused: false, phase_ends_at: new Date(Date.now() + (e.paused_remaining_ms ?? 0)).toISOString(), paused_remaining_ms: null });
}

export async function extendPhase(minutes = 5) {
  const e = await getEvent();
  if (e.paused) return updateEvent({ paused_remaining_ms: (e.paused_remaining_ms ?? 0) + minutes * 60_000 });
  const base = e.phase_ends_at ? Math.max(Date.parse(e.phase_ends_at), Date.now()) : Date.now();
  await updateEvent({ phase_ends_at: new Date(base + minutes * 60_000).toISOString() });
}

/** Which Drive folders a team can open in each phase. */
export function driveAccess(phase: Phase): "readme" | "all" | "locked" {
  if (phase === "lobby" || phase === "briefing") return "readme";
  if (phase === "audit" || phase === "report") return "all";
  return "locked";
}
