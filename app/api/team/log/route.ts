import { logActivity, ping } from "@/lib/db";
import { handler, requireTeam } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["file_open", "file_close", "focus_loss", "blocked_shortcut", "paste_blocked", "context_menu", "devtools", "print_attempt"]);

export const POST = handler(async (req: Request) => {
  const team = await requireTeam();
  const b = await req.json();
  const type = String(b.type ?? "");
  if (!ALLOWED.has(type)) return { ok: false };
  const d = b.detail && typeof b.detail === "object" ? b.detail : {};
  const detail = {
    ...(typeof d.ms === "number" ? { ms: Math.round(d.ms) } : {}),
    ...(typeof d.key === "string" ? { key: d.key.slice(0, 20) } : {}),
    ...(typeof d.page === "number" ? { page: d.page } : {}),
  };
  await logActivity(team.id, type, typeof b.docId === "string" ? b.docId.slice(0, 20) : null, detail);
  if (type === "focus_loss" || type === "devtools") await ping("activity");
  return { ok: true };
});
