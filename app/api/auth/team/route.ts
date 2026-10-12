import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, must, logActivity, ping } from "@/lib/db";
import { HttpError, handler, setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!name || !code) throw new HttpError(400, "Enter your team name and code.");

  const team = must(await db().from("teams").select("*").eq("code", code).maybeSingle()) as any;
  if (!team || team.name.toLowerCase() !== name.toLowerCase()) throw new HttpError(401, "That team name and code don't match.");

  const tableNo = String(body.table ?? "").trim().slice(0, 10);
  const members = (Array.isArray(body.members) ? body.members : []).map((m: unknown) => String(m ?? "").trim().slice(0, 60)).filter(Boolean).slice(0, 5);
  const finalTable = tableNo || team.table_no;
  const finalMembers = members.length ? members : team.members;
  if (!finalTable) throw new HttpError(400, "Enter your table number.");
  if (!finalMembers?.length) throw new HttpError(400, "Enter your team members' names.");

  const sid = randomUUID();
  must(
    await db()
      .from("teams")
      .update({ active_session_id: sid, table_no: finalTable, members: finalMembers, last_seen_at: new Date().toISOString() })
      .eq("id", team.id),
  );
  if (team.active_session_id) await logActivity(team.id, "second_login", null, { ua: req.headers.get("user-agent")?.slice(0, 160) });
  await logActivity(team.id, "login");
  await ping("teams");

  const res = NextResponse.json({ ok: true });
  await setSession(res, { role: "team", teamId: team.id, sid });
  return res;
});
