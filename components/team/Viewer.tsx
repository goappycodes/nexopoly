"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ManifestDoc, Note } from "@/lib/types";
import { Button, FileIconColored, Icon, IconButton, api, serverNow } from "../ui";
import { logEvent } from "./lockdown";

const ZOOMS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200];
const cache = new Map<string, { bmp: ImageBitmap; at: number }>();

async function loadBitmap(docId: string, page: number): Promise<ImageBitmap> {
  const key = `${docId}/${page}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 4 * 60_000) return hit.bmp;
  const { url } = await api<{ url: string }>(`/api/team/page?doc=${encodeURIComponent(docId)}&p=${page}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 409 ? "session_replaced" : "Could not load this page");
  const bmp = await createImageBitmap(await res.blob());
  cache.set(key, { bmp, at: Date.now() });
  return bmp;
}

/** Live watermark drawn over the page on the client (a second copy is burned into the image by the server). */
function useWatermark(label: string) {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () =>
      setT(new Date(serverNow()).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return useMemo(() => {
    const text = `${label} · ${t}`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='0' y='120' transform='rotate(-30 210 110)' font-family='Roboto,Arial' font-size='17' font-weight='700' fill='rgb(20,20,20)'>${text}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [label, t]);
}

export function Viewer({
  doc,
  page,
  setPage,
  watermark,
  notes,
  selectedNote,
  onSelectNote,
  onCreateNote,
  canNote,
  onBack,
  onClose,
}: {
  doc: ManifestDoc;
  page: number;
  setPage: (p: number) => void;
  watermark: string;
  notes: Note[];
  selectedNote: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (page: number, x: number | null, y: number | null, text: string) => Promise<void>;
  canNote: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState(900);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const wm = useWatermark(watermark);

  // Time-on-file logging.
  useEffect(() => {
    const opened = Date.now();
    logEvent("file_open", doc.docId);
    return () => logEvent("file_close", doc.docId, { ms: Date.now() - opened });
  }, [doc.docId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth - 64, doc.width >= doc.height ? 1400 : 980)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.width, doc.height]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setDraft(null);
    loadBitmap(doc.docId, page)
      .then((bmp) => {
        if (cancelled || !canvasRef.current) return;
        const c = canvasRef.current;
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setErrMsg(e.message === "session_replaced" ? "This team signed in on another device." : e.message);
        setStatus("error");
      });
    // Warm the next page.
    if (page < doc.pages) loadBitmap(doc.docId, page + 1).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc.docId, page, doc.pages]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") page < doc.pages && setPage(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") page > 1 && setPage(page - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [page, doc.pages, setPage]);

  const width = Math.round((fit * zoom) / 100);
  const height = Math.round((width * doc.height) / doc.width);
  const pageNotes = notes.filter((n) => n.page_no === page && n.x !== null && n.y !== null);
  const numberOf = new Map(notes.map((n, i) => [n.id, i + 1]));
  const zi = ZOOMS.indexOf(zoom);

  const clickPage = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canNote || status !== "ready") return;
    const r = e.currentTarget.getBoundingClientRect();
    setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    setDraftText("");
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#1F1F1F]">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2 text-[#E3E3E3]">
        <button onClick={onBack} title="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
          <Icon name="arrow_back" />
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded bg-white">
          <FileIconColored kind={doc.kind} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">{doc.title}</div>
        </div>
        <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-xs">{doc.docId}</span>
        <button onClick={onClose} title="Close" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
          <Icon name="close" />
        </button>
      </div>

      <div ref={wrapRef} className="scroll-thin relative flex-1 overflow-auto">
        <div className="flex min-h-full justify-center px-8 py-6">
          <div className="relative shrink-0 bg-white shadow-e3" style={{ width, height }} onClick={clickPage}>
            <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: wm, backgroundRepeat: "repeat" }} />
            {status !== "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-white text-ink2">
                {status === "loading" ? <Icon name="progress_activity" className="animate-spin text-primary" size={40} /> : errMsg}
              </div>
            )}
            {pageNotes.map((n) => (
              <button
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNote(n.id);
                }}
                className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none text-xs font-bold text-white shadow-e2 ${
                  selectedNote === n.id ? "bg-[#E37400] ring-4 ring-[#E37400]/30" : "bg-[#F9AB00]"
                }`}
                style={{ left: `${n.x! * 100}%`, top: `${n.y! * 100}%` }}
                title={n.text || "Note"}
              >
                {numberOf.get(n.id)}
              </button>
            ))}
            {draft && (
              <div
                className="absolute z-10 w-72 rounded-xl bg-white p-3 shadow-e3"
                style={{ left: `min(calc(${draft.x * 100}% + 8px), calc(100% - 18rem))`, top: `calc(${draft.y * 100}% + 8px)` }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon name="push_pin" size={18} className="text-[#E37400]" /> Pin a note here
                </div>
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={3}
                  placeholder="What did you spot? Cite figures."
                  className="w-full resize-none rounded-lg border border-outline p-2 text-sm outline-none focus:border-primary"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="text" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!draftText.trim()}
                    onClick={async () => {
                      await onCreateNote(page, draft.x, draft.y, draftText.trim());
                      setDraft(null);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-14 shrink-0 items-center justify-center gap-4 text-[#E3E3E3]">
        <div className="flex items-center gap-1 rounded-full bg-[#3C4043] px-2 py-1">
          <IconButton icon="chevron_left" title="Previous page" className="!text-[#E3E3E3] hover:!bg-white/10" disabled={page <= 1} onClick={() => setPage(page - 1)} />
          <span className="min-w-[90px] text-center text-sm">
            Page {page} / {doc.pages}
          </span>
          <IconButton icon="chevron_right" title="Next page" className="!text-[#E3E3E3] hover:!bg-white/10" disabled={page >= doc.pages} onClick={() => setPage(page + 1)} />
          <span className="mx-2 h-6 w-px bg-white/20" />
          <IconButton icon="zoom_out" title="Zoom out" className="!text-[#E3E3E3] hover:!bg-white/10" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])} />
          <button className="min-w-[56px] text-sm hover:underline" onClick={() => setZoom(100)} title="Fit to width">
            {zoom}%
          </button>
          <IconButton icon="zoom_in" title="Zoom in" className="!text-[#E3E3E3] hover:!bg-white/10" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zi + 1])} />
        </div>
        {canNote && <span className="hidden text-xs text-[#9AA0A6] md:inline">Click anywhere on the page to pin a note</span>}
      </div>
    </div>
  );
}
