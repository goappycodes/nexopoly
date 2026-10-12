import { db } from "@/lib/db";
import { handler, requireTeam } from "@/lib/session";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  const inject = Number((await req.json()).inject);
  if (inject === 1 || inject === 2) {
    await db().from("inbox_reads").upsert({ team_id: team.id, inject_no: inject }, { onConflict: "team_id,inject_no", ignoreDuplicates: true });
  }
  return { ok: true };
});
