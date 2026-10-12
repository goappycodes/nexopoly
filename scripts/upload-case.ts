// Publishes the generated case to Supabase and the app:
//   case/out/pages/<DOC>/<n>.png  -> storage bucket "pages" (private)
//   case/answer_key.json          -> storage bucket "secure" (private, never in git or the client)
//   case/out/manifest.json, public.json -> data/ (public metadata the app imports)
import { config } from "dotenv";
import { copyFileSync, existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const root = path.resolve("case");
const pagesDir = path.join(root, "out", "pages");

async function upload(bucket: string, key: string, body: Buffer, contentType: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await sb.storage.from(bucket).upload(key, body, { contentType, upsert: true });
    if (!error) return;
    if (attempt === 3) throw new Error(`${bucket}/${key}: ${error.message}`);
  }
}

(async () => {
  if (!existsSync(pagesDir)) throw new Error("case/out/pages not found. Run the case pipeline first.");
  const manifest = JSON.parse(readFileSync(path.join(root, "out", "manifest.json"), "utf8")) as { docId: string; pages: number }[];
  const jobs: (() => Promise<void>)[] = [];
  for (const doc of readdirSync(pagesDir)) {
    for (const f of readdirSync(path.join(pagesDir, doc))) {
      if (!f.endsWith(".png")) continue;
      jobs.push(() => upload("pages", `${doc}/${f}`, readFileSync(path.join(pagesDir, doc, f)), "image/png"));
    }
  }
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (jobs.length) {
        await jobs.shift()!();
        done++;
      }
    }),
  );
  console.log(`uploaded ${done} page images`);

  // Every manifest page must exist in storage.
  for (const d of manifest) {
    for (let p = 1; p <= d.pages; p++) {
      if (!existsSync(path.join(pagesDir, d.docId, `${p}.png`))) throw new Error(`missing page ${d.docId}/${p}`);
    }
  }

  await upload("secure", "answer_key.json", readFileSync(path.join(root, "answer_key.json")), "application/json");
  console.log("uploaded answer key to private storage");

  copyFileSync(path.join(root, "out", "manifest.json"), path.resolve("data", "manifest.json"));
  copyFileSync(path.join(root, "out", "public.json"), path.resolve("data", "public.json"));
  console.log("copied manifest.json and public.json into data/");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
