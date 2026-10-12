import "server-only";
import { db } from "./db";

// Faculty feedback lives in the private "secure" bucket, one small JSON file per item,
// so saves on different items never overwrite each other and no table is needed.

const FOLDER = "faculty-feedback";
const KEY = /^(general|overview|doc|issue|rh):[A-Za-z0-9_-]{1,40}$/;

export interface FeedbackEntry {
  key: string;
  text: string;
  updated_at: string;
}

export const validKey = (k: string) => KEY.test(k);
const fileFor = (k: string) => `${FOLDER}/${k.replace(":", "__")}.json`;

export async function listFeedback(): Promise<Record<string, FeedbackEntry>> {
  const { data: files } = await db().storage.from("secure").list(FOLDER, { limit: 500 });
  const out: Record<string, FeedbackEntry> = {};
  await Promise.all(
    (files ?? [])
      .filter((f) => f.name.endsWith(".json"))
      .map(async (f) => {
        const { data } = await db().storage.from("secure").download(`${FOLDER}/${f.name}`);
        if (!data) return;
        try {
          const e = JSON.parse(await data.text()) as FeedbackEntry;
          if (validKey(e.key)) out[e.key] = e;
        } catch {}
      }),
  );
  return out;
}

export async function saveFeedback(key: string, text: string): Promise<FeedbackEntry | null> {
  if (!text.trim()) {
    await db().storage.from("secure").remove([fileFor(key)]);
    return null;
  }
  const entry: FeedbackEntry = { key, text, updated_at: new Date().toISOString() };
  const { error } = await db()
    .storage.from("secure")
    .upload(fileFor(key), JSON.stringify(entry), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(error.message);
  return entry;
}
