// Keeps the private case folder (generator, case data, answer key) off GitHub but reachable
// from any machine that has .env.local:
//   npx tsx scripts/case-backup.ts push   -> zips case/ (without out/) to the private "secure" bucket
//   npx tsx scripts/case-backup.ts pull   -> restores case/ from that zip
import { config } from "dotenv";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const KEY = "case-backup.zip";
const SKIP = new Set(["out", "node_modules"]);

function addDir(zip: JSZip, dir: string, rel = "") {
  for (const name of readdirSync(dir)) {
    if (!rel && SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) addDir(zip, full, r);
    else zip.file(r, readFileSync(full));
  }
}

(async () => {
  const mode = process.argv[2];
  if (mode === "push") {
    const zip = new JSZip();
    addDir(zip, path.resolve("case"));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const { error } = await sb.storage.from("secure").upload(KEY, buf, { contentType: "application/zip", upsert: true });
    if (error) throw error;
    console.log(`backed up case/ (${Math.round(buf.length / 1024)} KB) to secure/${KEY}`);
  } else if (mode === "pull") {
    const { data, error } = await sb.storage.from("secure").download(KEY);
    if (error || !data) throw error ?? new Error("No backup found");
    const zip = await JSZip.loadAsync(Buffer.from(await data.arrayBuffer()));
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const out = path.resolve("case", name);
      if (!existsSync(path.dirname(out))) mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, await entry.async("nodebuffer"));
    }
    console.log("restored case/ from private storage");
  } else {
    console.log("usage: npx tsx scripts/case-backup.ts push|pull");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
