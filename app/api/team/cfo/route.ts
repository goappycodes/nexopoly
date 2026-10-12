import { db, must, ping } from "@/lib/db";
import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { cfoAnswer } from "@/lib/answerKey";

export const dynamic = "force-dynamic";

const LIMIT = 2;

export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  const e = await getEvent();
  if (!e.cfo_open) throw new HttpError(403, "The Accounts desk is closed right now.");
  const question = String((await req.json()).question ?? "").trim().slice(0, 400);
  if (question.length < 10) throw new HttpError(400, "Type your question first.");

  const { topic, answer } = await cfoAnswer(question);

  // Claim a slot atomically so a double click cannot use three questions.
  const claimed = must(
    await db().from("teams").update({ cfo_used: team.cfo_used + 1 }).eq("id", team.id).eq("cfo_used", team.cfo_used).lt("cfo_used", LIMIT).select("id"),
  );
  if (!claimed.length) throw new HttpError(403, "You have used both questions.");

  must(await db().from("cfo_questions").insert({ team_id: team.id, question, matched_topic: topic, answer }));
  await ping("cfo");
  return { ok: true };
});
