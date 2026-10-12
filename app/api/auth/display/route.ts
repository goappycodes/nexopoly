import { NextResponse } from "next/server";
import { HttpError, handler, setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const { pin } = await req.json().catch(() => ({}));
  if (!process.env.DISPLAY_PIN || String(pin ?? "").trim() !== process.env.DISPLAY_PIN) throw new HttpError(401, "Wrong display PIN.");
  const res = NextResponse.json({ ok: true });
  await setSession(res, { role: "display" });
  return res;
});
