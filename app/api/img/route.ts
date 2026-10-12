import { NextResponse } from "next/server";
import { readSession, verify } from "@/lib/session";
import { db } from "@/lib/db";
import { loadPage, watermarked } from "@/lib/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deny = (status: number, msg: string) => new NextResponse(msg, { status, headers: { "Cache-Control": "no-store" } });

/** Serves one watermarked page. Needs both a valid signed token and the same team's live session cookie. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const claims = await verify<{ t: string; s: string; d: string; p: number }>(token);
  if (!claims) return deny(403, "Link expired");
  const session = await readSession();
  if (session?.role !== "team" || session.teamId !== claims.t || session.sid !== claims.s) return deny(403, "Not signed in");

  const { data: team } = await db().from("teams").select("name,code,active_session_id").eq("id", claims.t).maybeSingle();
  if (!team || team.active_session_id !== claims.s) return deny(409, "Session replaced");

  try {
    const src = await loadPage(claims.d, claims.p);
    const out = await watermarked(src, team);
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store, private",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: any) {
    console.error(e);
    return deny(404, "Page unavailable");
  }
}
