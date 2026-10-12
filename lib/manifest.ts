import manifestJson from "@/data/manifest.json";
import publicJson from "@/data/public.json";
import type { ManifestDoc } from "./types";

export const MANIFEST = manifestJson as ManifestDoc[];
export const CASE_PUBLIC = publicJson as { company: string; claimed_pbt: number; doc_ids: string[] };

export const README_FOLDER = "00 Read Me";
export const INBOX = "Inbox";

/** Inject 2 is drawn at runtime because its deadline is the real clock time when it is pushed. */
export const INJECT2: ManifestDoc = {
  docId: "INJ-02",
  folder: INBOX,
  title: "WhatsApp from Rajiv Mittal (forwarded by Teesta Ventures)",
  kind: "chat",
  owner: "Teesta Ventures",
  modified: "",
  pages: 1,
  width: 1240,
  height: 1500,
  inject: 2,
};

export const caseDocs = () => MANIFEST.filter((d) => !d.inject);
export const caseFolders = () => Array.from(new Set(caseDocs().map((d) => d.folder))).sort();
export const findDoc = (docId: string) => (docId === "INJ-02" ? INJECT2 : MANIFEST.find((d) => d.docId === docId));

/** Doc IDs a team can cite in its report. */
export const citableIds = () => [...MANIFEST.map((d) => d.docId), INJECT2.docId];
