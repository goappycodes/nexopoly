import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await readSession();
  if (s?.role !== "admin") return new NextResponse("Admin only", { status: 401 });
  const team = new URL(req.url).searchParams.get("team") ?? "";
  const { data } = await db().storage.from("reports").download(`${team}.pdf`);
  if (!data) return new NextResponse("No PDF yet", { status: 404 });
  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="report-${team}.pdf"`, "Cache-Control": "no-store" },
  });
}
