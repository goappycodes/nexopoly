import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { findDoc } from "@/lib/manifest";
import { loadPage, watermarked } from "@/lib/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deny = (status: number, msg: string) => new NextResponse(msg, { status, headers: { "Cache-Control": "no-store" } });

/** One watermarked page for the faculty review page. Needs a faculty or admin session. */
export async function GET(req: Request) {
  const s = await readSession();
  if (s?.role !== "faculty" && s?.role !== "admin") return deny(401, "Not signed in");
  const url = new URL(req.url);
  const doc = findDoc(url.searchParams.get("doc") ?? "");
  const page = Number(url.searchParams.get("p") ?? "1");
  if (!doc || !Number.isInteger(page) || page < 1 || page > doc.pages) return deny(404, "No such page");
  try {
    const out = await watermarked(await loadPage(doc.docId, page), { name: "Faculty review", code: "CONFIDENTIAL" });
    return new NextResponse(new Uint8Array(out), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(e);
    return deny(404, "Page unavailable");
  }
}
