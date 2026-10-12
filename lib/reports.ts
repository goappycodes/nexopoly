import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, degrees, PDFFont, PDFPage } from "pdf-lib";
import { db, must, ping } from "./db";
import { citableIds, CASE_PUBLIC } from "./manifest";
import { LIMITS, emptyReport, wordCount, type ReportData, type Finding, type Phase } from "./types";

const clampWords = (s: unknown, max: number) => {
  const str = typeof s === "string" ? s : "";
  const words = str.trim().split(/\s+/);
  return words.length > max ? words.slice(0, max).join(" ") : str;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | "" => (allowed.includes(v as T) ? (v as T) : "");

/** Normalises untrusted report input to the fixed template and its limits. */
export function sanitize(input: any): ReportData {
  const ids = new Set(citableIds());
  const r = emptyReport();
  r.summary = clampWords(input?.summary, LIMITS.summaryWords);
  r.findings = (Array.isArray(input?.findings) ? input.findings : []).slice(0, LIMITS.findings).map(
    (f: any, i: number): Finding => ({
      id: typeof f?.id === "string" ? f.id.slice(0, 40) : `f${i}`,
      title: String(f?.title ?? "").slice(0, 120),
      description: clampWords(f?.description, LIMITS.findingWords),
      evidence: (Array.isArray(f?.evidence) ? f.evidence : []).filter((d: string) => ids.has(d)).slice(0, 10),
      type: pick(f?.type, ["Error", "Leakage", "Misrepresentation"] as const),
      status: pick(f?.status, ["Proven", "Needs verification"] as const),
      impact: num(f?.impact),
      impactOn: pick(f?.impactOn, ["Profit", "Cash", "Balance sheet", "Not quantified"] as const),
    }),
  );
  r.cashLeakage = num(input?.cashLeakage);
  r.adjustedOcf = num(input?.adjustedOcf);
  return r;
}

/** During the audit only the findings table is editable; everything else keeps its stored value. */
export function mergeForPhase(stored: ReportData, incoming: ReportData, phase: Phase): ReportData {
  if (phase === "report") return incoming;
  if (phase === "audit") return { ...stored, findings: incoming.findings };
  return stored;
}


/** A partial edit from one laptop: changed fields, changed or new finding rows, and deleted rows. */
export interface ReportPatch {
  summary?: string;
  cashLeakage?: number | null;
  adjustedOcf?: number | null;
  findings?: Finding[];
  deleted?: string[];
}

/**
 * Applies one laptop's changes on top of the stored report, so teammates editing different
 * fields or different finding rows never overwrite each other. Uses compare-and-swap on
 * updated_at and retries if another save landed in between.
 */
export async function applyReportPatch(teamId: string, patch: ReportPatch, phase: Phase) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await loadReport(teamId);
    if (row?.status === "submitted") return { conflict: "submitted" as const };
    const base = sanitize(row?.data ?? {});
    const next: ReportData = { ...base, findings: [...base.findings] };
    if (phase === "report") {
      if (patch.summary !== undefined) next.summary = patch.summary;
      if (patch.cashLeakage !== undefined) next.cashLeakage = patch.cashLeakage;
      if (patch.adjustedOcf !== undefined) next.adjustedOcf = patch.adjustedOcf;
    }
    const gone = new Set(patch.deleted ?? []);
    next.findings = next.findings.filter((x) => !gone.has(x.id));
    for (const fnd of patch.findings ?? []) {
      if (gone.has(fnd.id)) continue;
      const i = next.findings.findIndex((x) => x.id === fnd.id);
      if (i >= 0) next.findings[i] = fnd;
      else next.findings.push(fnd);
    }
    const data = sanitize(next);
    const now = new Date().toISOString();
    if (row) {
      const res = must(await db().from("reports").update({ data, status: "drafting", updated_at: now }).eq("team_id", teamId).eq("updated_at", row.updated_at).select("team_id"));
      if (res.length) return { data, updated_at: now };
    } else {
      const res = await db().from("reports").insert({ team_id: teamId, data, status: "drafting", updated_at: now });
      if (!res.error) return { data, updated_at: now };
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
  }
  throw new Error("The report is busy. Try again.");
}

/** Turns an untrusted save body into a patch. Older clients send the whole report as `data`. */
export function toPatch(body: any): ReportPatch {
  const src = body?.patch ?? body?.data;
  if (!src || typeof src !== "object") return {};
  const clean = sanitize({ ...src, findings: Array.isArray(src.findings) ? src.findings : [] });
  const patch: ReportPatch = {};
  if ("summary" in src) patch.summary = clean.summary;
  if ("cashLeakage" in src) patch.cashLeakage = clean.cashLeakage;
  if ("adjustedOcf" in src) patch.adjustedOcf = clean.adjustedOcf;
  if (Array.isArray(src.findings)) patch.findings = clean.findings;
  if (Array.isArray(src.deleted)) patch.deleted = src.deleted.filter((x: unknown) => typeof x === "string").slice(0, 50);
  return patch;
}

export async function loadReport(teamId: string) {
  const row = must(await db().from("reports").select("*").eq("team_id", teamId).maybeSingle());
  return row as null | { team_id: string; data: ReportData; status: string; submitted_at: string | null; auto_submitted: boolean; pdf_path: string | null; updated_at: string };
}

export async function submitReport(teamId: string, auto: boolean) {
  const existing = await loadReport(teamId);
  if (existing?.status === "submitted") return existing;
  const team = must(await db().from("teams").select("*").eq("id", teamId).single());
  const data = sanitize(existing?.data ?? {});
  const submittedAt = new Date().toISOString();
  const pdf = await buildReportPdf(team, data, submittedAt, auto);
  const pdfPath = `${teamId}.pdf`;
  must(await db().storage.from("reports").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true }));
  const row = must(
    await db()
      .from("reports")
      .upsert({ team_id: teamId, data, status: "submitted", submitted_at: submittedAt, auto_submitted: auto, pdf_path: pdfPath, updated_at: submittedAt })
      .select("*")
      .single(),
  );
  await ping("reports");
  return row;
}

export async function autoSubmitAll() {
  const teams = must(await db().from("teams").select("id"));
  const reports = must(await db().from("reports").select("team_id,status"));
  const done = new Set(reports.filter((r: any) => r.status === "submitted").map((r: any) => r.team_id));
  for (const t of teams as { id: string }[]) {
    if (done.has(t.id)) continue;
    try {
      await submitReport(t.id, true);
    } catch (e) {
      console.error("auto-submit failed", t.id, e);
    }
  }
}

// ---------- PDF ----------

const inr = (n: number | null) => {
  if (n === null) return "-";
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}Rs ${rest ? rest + "," : ""}${last3}.${dec}`;
};

/** Standard PDF fonts only cover WinAnsi, so strip anything else. */
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₹/g, "Rs ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

export async function buildReportPdf(team: any, r: ReportData, submittedAt: string, auto: boolean) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: any = null;
  try {
    logo = await doc.embedPng(readFileSync(path.join(process.cwd(), "public/brand/nexis-logo-dark.png")));
  } catch {}

  const W = 595.28, H = 841.89, M = 48;
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawText("SUBMITTED REPORT", { x: 110, y: 300, size: 54, font: bold, color: rgb(0.85, 0.87, 0.9), rotate: degrees(35), opacity: 0.35 });
    if (logo) {
      const s = 22 / logo.height;
      page.drawImage(logo, { x: M, y: H - M - 22, width: logo.width * s, height: 22 });
    }
    page.drawText("Nexopoly  |  Audit report", { x: W - M - 150, y: H - M - 15, size: 9, font, color: rgb(0.27, 0.28, 0.27) });
    page.drawLine({ start: { x: M, y: H - M - 32 }, end: { x: W - M, y: H - M - 32 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
    page.drawText(safe(`${team.name}  |  Submitted ${new Date(submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST${auto ? "  |  AUTO-SUBMITTED" : ""}`), {
      x: M,
      y: 26,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y = H - M - 56;
  };

  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of safe(text).split(/\n/)) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const t = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > width && line) {
          out.push(line);
          line = w;
        } else line = t;
      }
      out.push(line);
    }
    return out;
  };

  const text = (s: string, opts: { size?: number; f?: PDFFont; indent?: number; color?: any; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    const x = M + (opts.indent ?? 0);
    for (const line of wrap(s || "-", f, size, W - M - x)) {
      if (y < 60) newPage();
      page.drawText(line, { x, y, size, font: f, color: opts.color ?? rgb(0.12, 0.12, 0.12) });
      y -= size * 1.4;
    }
    y -= opts.gap ?? 4;
  };
  const heading = (s: string) => {
    if (y < 110) newPage();
    y -= 6;
    text(s, { size: 12.5, f: bold, color: rgb(0.04, 0.34, 0.82), gap: 6 });
  };

  newPage();
  text(CASE_PUBLIC.company + " - audit report", { size: 18, f: bold, gap: 2 });
  text(`Prepared by ${team.name}${team.table_no ? `, table ${team.table_no}` : ""}`, { size: 10, color: rgb(0.35, 0.35, 0.35), gap: 10 });

  heading("1. Team");
  text(`${team.name}: ${(team.members ?? []).filter(Boolean).join(", ") || "-"}`);
  heading("2. Executive summary");
  text(r.summary);
  heading(`3. Findings (${r.findings.length})`);
  r.findings.forEach((f, i) => {
    text(`${i + 1}. ${f.title || "Untitled finding"}`, { f: bold, gap: 1 });
    text(`${f.type || "-"}  |  ${f.status || "-"}  |  Impact ${inr(f.impact)} on ${f.impactOn || "-"}  |  Evidence: ${f.evidence.join(", ") || "-"}`, { size: 8.5, indent: 12, color: rgb(0.35, 0.35, 0.35), gap: 1 });
    text(f.description, { indent: 12, gap: 6 });
  });
  heading("4. Cash");
  text(`Total cash leakage found: ${inr(r.cashLeakage)}`, { gap: 1 });
  text(`Operating cash flow as the team believes it really is: ${inr(r.adjustedOcf)}`);
  return Buffer.from(await doc.save());
}

export { wordCount };
