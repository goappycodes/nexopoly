import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { HttpError, handler, setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const POST = handler(async (req: Request) => {
  const { password } = await req.json().catch(() => ({}));
  if (!process.env.FACULTY_PASSWORD || !same(String(password ?? ""), process.env.FACULTY_PASSWORD)) throw new HttpError(401, "Wrong faculty password.");
  const res = NextResponse.json({ ok: true });
  await setSession(res, { role: "faculty" });
  return res;
});
