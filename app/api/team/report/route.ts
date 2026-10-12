import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { applyReportPatch, loadReport, sanitize, toPatch } from "@/lib/reports";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const team = await requireTeam();
  const row = await loadReport(team.id);
  return {
    report: sanitize(row?.data ?? {}),
    status: row?.status ?? "not_started",
    submitted_at: row?.submitted_at ?? null,
    auto_submitted: row?.auto_submitted ?? false,
    updated_at: row?.updated_at ?? null,
  };
});

/** Autosave from one laptop: merged with teammates' changes. Only the parts the phase allows are written. */
export const PUT = handler(async (req: Request) => {
  const team = await requireTeam();
  const e = await getEvent();
  if (e.phase !== "audit" && e.phase !== "report") throw new HttpError(403, "The report is locked.");
  const out = await applyReportPatch(team.id, toPatch(await req.json()), e.phase);
  if ("conflict" in out) throw new HttpError(403, "Your report is already submitted.");
  return { ok: true, savedAt: out.updated_at, report: out.data, updated_at: out.updated_at };
});
