import { db, must } from "@/lib/db";
import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { loadReport, sanitize, submitReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  const e = await getEvent();
  if (e.phase !== "report") throw new HttpError(403, "Submission opens in the report phase.");
  const { data } = await req.json().catch(() => ({ data: null }));
  const row = await loadReport(team.id);
  if (row?.status === "submitted") return { ok: true, already: true };
  // Save the final state first, then lock and render the PDF.
  if (data) {
    must(await db().from("reports").upsert({ team_id: team.id, data: sanitize(data), status: "drafting", updated_at: new Date().toISOString() }));
  }
  const report = await submitReport(team.id, false);
  return { ok: true, submitted_at: report.submitted_at };
});
