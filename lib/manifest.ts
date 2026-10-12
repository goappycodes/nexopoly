import manifestJson from "@/data/manifest.json";
import publicJson from "@/data/public.json";
import type { ManifestDoc } from "./types";

export const MANIFEST = manifestJson as ManifestDoc[];
export const CASE_PUBLIC = publicJson as { company: string; claimed_pbt: number; doc_ids: string[] };

export const README_FOLDER = "00 Read Me";
export const INBOX = "Inbox";

export const caseDocs = () => MANIFEST.filter((d) => !d.inject);
export const caseFolders = () => Array.from(new Set(caseDocs().map((d) => d.folder))).sort();
export const findDoc = (docId: string) => MANIFEST.find((d) => d.docId === docId);

/** Doc IDs a team can cite in its report. */
export const citableIds = () => MANIFEST.map((d) => d.docId);
