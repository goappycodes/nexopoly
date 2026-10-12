import { HttpError, handler, requireTeam, sign } from "@/lib/session";
import { getEvent, driveAccess } from "@/lib/state";
import { findDoc, README_FOLDER } from "@/lib/manifest";

export const dynamic = "force-dynamic";

/** Issues a 60-second signed URL for one page image. */
export const GET = handler(async (req: Request) => {
  const team = await requireTeam();
  const url = new URL(req.url);
  const docId = url.searchParams.get("doc") ?? "";
  const page = Number(url.searchParams.get("p") ?? "1");
  const doc = findDoc(docId);
  if (!doc || !Number.isInteger(page) || page < 1 || page > doc.pages) throw new HttpError(404, "No such page");

  const e = await getEvent();
  const access = driveAccess(e.phase);
  if (access === "locked") throw new HttpError(403, "The Drive is locked.");
  if (access === "readme" && doc.folder !== README_FOLDER) throw new HttpError(403, "This folder opens when the audit starts.");
  if (doc.inject === 1 && !e.inject1_at) throw new HttpError(403, "Not delivered yet");

  const token = await sign({ t: team.id, s: team.active_session_id, d: docId, p: page }, "60s");
  return { url: `/api/img?t=${encodeURIComponent(token)}` };
});
