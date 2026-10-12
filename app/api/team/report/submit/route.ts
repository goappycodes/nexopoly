import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { applyReportPatch, loadReport, submitReport, toPatch } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Locks the team's report. Any last unsaved changes from this laptop are merged first, never overwriting teammates. */
export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  const e = await getEvent();
  if (e.phase !== "report") throw new HttpError(403, "Submission opens in the report phase.");
  const row = await loadReport(team.id);
  if (row?.status === "submitted") return { ok: true, already: true };
  const patch = toPatch(await req.json().catch(() => ({})));
  if (Object.keys(patch).length) await applyReportPatch(team.id, patch, e.phase);
  const report = await submitReport(team.id, false);
  return { ok: true, submitted_at: report.submitted_at };
});
