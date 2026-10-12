import { db, must, ping, logActivity } from "@/lib/db";
import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { citableIds } from "@/lib/manifest";
import { nextPosition, sessionLimit, usedSessions } from "@/lib/queue";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  const e = await getEvent();
  if (!e.queue_open) throw new HttpError(403, "Expert meetings aren't open right now.");
  const b = await req.json();
  // No question is needed: the expert simply comes to the table for 2 minutes.
  const question = String(b.question ?? "").trim().slice(0, 600);
  const ids = new Set(citableIds());
  const docIds = (Array.isArray(b.docIds) ? b.docIds : []).filter((d: string) => ids.has(d)).slice(0, 8);

  const used = (await usedSessions(team.id)).get(team.id) ?? 0;
  if (used >= sessionLimit(team)) throw new HttpError(403, "You have used all your expert meetings.");

  const res = await db().from("expert_requests").insert({ team_id: team.id, question, doc_ids: docIds, position: await nextPosition() });
  // The partial unique index rejects a second open request, even on a double click.
  if (res.error?.code === "23505") throw new HttpError(409, "You already have a meeting requested.");
  must(res);
  await logActivity(team.id, "vishal_request");
  await ping("queue");
  return { ok: true };
});

/** Cancel while waiting. The session is not used. */
export const DELETE = handler(async () => {
  const team = await requireTeam();
  must(await db().from("expert_requests").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("team_id", team.id).eq("status", "waiting"));
  await ping("queue");
  return { ok: true };
});
