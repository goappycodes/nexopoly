import { db, must } from "@/lib/db";
import { handler, requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const team = new URL(req.url).searchParams.get("team") ?? "";
  const rows = must(await db().from("activity_log").select("*").eq("team_id", team).order("created_at", { ascending: false }).limit(300));
  const grades = must(await db().from("grades").select("*").eq("team_id", team).order("run_no"));
  return { rows, grades };
});
