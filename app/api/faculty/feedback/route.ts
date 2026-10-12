import { HttpError, handler, requireFaculty } from "@/lib/session";
import { saveFeedback, validKey } from "@/lib/facultyFeedback";

export const dynamic = "force-dynamic";

export const PUT = handler(async (req: Request) => {
  await requireFaculty();
  const b = await req.json().catch(() => ({}));
  const key = String(b.key ?? "");
  if (!validKey(key)) throw new HttpError(400, "Unknown item");
  const text = String(b.text ?? "").slice(0, 4000);
  return { entry: await saveFeedback(key, text) };
});
