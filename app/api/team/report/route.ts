import { db, must } from "@/lib/db";
import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { loadReport, mergeForPhase, sanitize } from "@/lib/reports";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const team = await requireTeam();
  const row = await loadReport(team.id);
  return { report: sanitize(row?.data ?? {}), status: row?.status ?? "not_started", submitted_at: row?.submitted_at ?? null, auto_submitted: row?.auto_submitted ?? false };
});

/** Autosave. Only the parts the current phase allows are written. */
export const PUT = handler(async (req: Request) => {
  const team = await requireTeam();
  const e = await getEvent();
  if (e.phase !== "audit" && e.phase !== "report") throw new HttpError(403, "The report is locked.");
  const row = await loadReport(team.id);
  if (row?.status === "submitted") throw new HttpError(403, "Your report is already submitted.");
  const { data } = await req.json();
  const merged = mergeForPhase(sanitize(row?.data ?? {}), sanitize(data), e.phase);
  const now = new Date().toISOString();
  must(await db().from("reports").upsert({ team_id: team.id, data: merged, status: "drafting", updated_at: now }));
  return { ok: true, savedAt: now };
});
