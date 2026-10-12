import { db, must } from "@/lib/db";
import { HttpError, handler, requireTeam } from "@/lib/session";
import { getEvent } from "@/lib/state";
import { findDoc, MANIFEST } from "@/lib/manifest";
import { NOTE_STATUS, NOTE_TAGS } from "@/lib/types";

export const dynamic = "force-dynamic";

const FIELDS = "id,doc_id,page_no,x,y,text,tag,status,author,created_at,updated_at";

async function assertEditable() {
  const e = await getEvent();
  if (!["briefing", "audit", "report"].includes(e.phase)) throw new HttpError(403, "Notes are locked.");
}

const clean = (b: any) => {
  const out: Record<string, unknown> = {};
  if (typeof b.text === "string") out.text = b.text.slice(0, 2000);
  if ("tag" in b) out.tag = NOTE_TAGS.includes(b.tag) ? b.tag : null;
  if ("status" in b) out.status = NOTE_STATUS.includes(b.status) ? b.status : null;
  return out;
};

export const GET = handler(async () => {
  const team = await requireTeam();
  const notes = must(await db().from("notes").select(FIELDS).eq("team_id", team.id).order("created_at"));
  const folders = Object.fromEntries(MANIFEST.map((d) => [d.docId, d.folder]));
  return { notes, folders };
});

export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  await assertEditable();
  const b = await req.json();
  const doc = findDoc(String(b.doc_id ?? ""));
  if (!doc) throw new HttpError(400, "Unknown document");
  const page = Math.min(Math.max(1, Number(b.page_no) || 1), doc.pages);
  const pos = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null);
  const note = must(
    await db()
      .from("notes")
      .insert({ team_id: team.id, doc_id: doc.docId, page_no: page, x: pos(b.x), y: pos(b.y), author: team.member ?? null, ...clean(b) })
      .select(FIELDS)
      .single(),
  );
  return { note };
});

export const PATCH = handler(async (req: Request) => {
  const team = await requireTeam();
  await assertEditable();
  const b = await req.json();
  const note = must(
    await db()
      .from("notes")
      .update({ ...clean(b), updated_at: new Date().toISOString() })
      .eq("id", String(b.id))
      .eq("team_id", team.id)
      .select(FIELDS)
      .single(),
  );
  return { note };
});

export const DELETE = handler(async (req: Request) => {
  const team = await requireTeam();
  await assertEditable();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  must(await db().from("notes").delete().eq("id", id).eq("team_id", team.id));
  return { ok: true };
});
