import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, must, logActivity, ping } from "@/lib/db";
import { HttpError, handler, setSession } from "@/lib/session";
import { getEvent } from "@/lib/state";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  const you = String(body.you ?? "").trim().slice(0, 60);
  if (!name || !code) throw new HttpError(400, "Enter your team name and code.");
  if (!you) throw new HttpError(400, "Enter your own name.");

  const team = must(await db().from("teams").select("*").eq("code", code).maybeSingle()) as any;
  const norm = (x: string) => x.trim().replace(/\s+/g, " ").toLowerCase();
  if (!team || norm(team.name) !== norm(name)) throw new HttpError(401, "That team name and code don't match.");

  const tableNo = String(body.table ?? "").trim().slice(0, 10);
  const members = (Array.isArray(body.members) ? body.members : []).map((m: unknown) => String(m ?? "").trim().slice(0, 60)).filter(Boolean).slice(0, 5);
  const finalTable = tableNo || team.table_no;
  const finalMembers = members.length ? members : team.members;
  if (!finalTable) throw new HttpError(400, "Enter your table number.");
  if (!finalMembers?.length) throw new HttpError(400, "Enter your team members' names.");

  const e = await getEvent();
  const limit = Math.max(1, e.devices_per_team ?? 3);
  const ua = req.headers.get("user-agent")?.slice(0, 160) ?? null;

  // A laptop signed in before multi-laptop support has no session row yet: keep it counted.
  if (team.active_session_id) await db().from("team_sessions").upsert({ id: team.active_session_id, team_id: team.id }, { ignoreDuplicates: true });

  const sid = randomUUID();
  must(await db().from("team_sessions").insert({ id: sid, team_id: team.id, member: you, user_agent: ua }));
  must(
    await db()
      .from("teams")
      .update({ active_session_id: sid, table_no: finalTable, members: finalMembers, last_seen_at: new Date().toISOString() })
      .eq("id", team.id),
  );

  // Over the limit: the oldest laptops are signed out, and that is logged for the admin.
  const sessions = must(await db().from("team_sessions").select("id,member").eq("team_id", team.id).order("created_at", { ascending: false })) as { id: string; member: string | null }[];
  const extra = sessions.slice(limit);
  if (extra.length) {
    must(await db().from("team_sessions").delete().in("id", extra.map((s) => s.id)));
    for (const s of extra) await logActivity(team.id, "second_login", null, { key: `signed out ${s.member ?? "a laptop"}` });
  }
  await logActivity(team.id, "login", null, { key: you });
  await ping("teams");

  const res = NextResponse.json({ ok: true });
  await setSession(res, { role: "team", teamId: team.id, sid });
  return res;
});
