"use client";

import { useEffect, useRef } from "react";
import { api } from "../ui";

export function logEvent(type: string, docId?: string | null, detail?: Record<string, unknown>) {
  api("/api/team/log", { method: "POST", json: { type, docId, detail } }).catch(() => {});
}

const isEditable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

// Text copied out of the team's own notes. Notes accept a paste only if it matches this.
let ownClipboard = "";
export const rememberCopy = (text: string) => {
  ownClipboard = text;
};
export const isOwnClip = (text: string) => !!text && text === ownClipboard;

/**
 * Team-side integrity controls: blocks selection, right-click, drag and the copy / select-all /
 * save / print / view-source shortcuts.
 */
export function useLockdown(currentDoc: () => string | null) {
  const lastBlockLog = useRef(0);

  useEffect(() => {
    document.body.classList.add("no-print");
    const throttledLog = (type: string, key?: string) => {
      if (Date.now() - lastBlockLog.current < 800) return;
      lastBlockLog.current = Date.now();
      logEvent(type, currentDoc(), key ? { key } : undefined);
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === "f12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k))) {
        e.preventDefault();
        throttledLog("devtools", k);
        return;
      }
      if (!mod) return;
      if (["s", "p", "u"].includes(k) || (["c", "a", "x"].includes(k) && !isEditable(e.target))) {
        e.preventDefault();
        e.stopPropagation();
        throttledLog(k === "p" ? "print_attempt" : "blocked_shortcut", `${e.metaKey ? "cmd" : "ctrl"}+${k}`);
      }
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      throttledLog("context_menu");
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!isEditable(e.target)) {
        e.preventDefault();
        throttledLog("blocked_shortcut", "copy");
      }
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    const onSelect = (e: Event) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    const onBeforePrint = () => logEvent("print_attempt", currentDoc());

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("dragstart", onDrag);
    document.addEventListener("selectstart", onSelect);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => {
      document.body.classList.remove("no-print");
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("dragstart", onDrag);
      document.removeEventListener("selectstart", onSelect);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, [currentDoc]);
}

/** Props for report fields: paste and drop are always blocked. */
export const noPaste = {
  onPaste: (e: React.ClipboardEvent) => {
    e.preventDefault();
    logEvent("paste_blocked");
    window.dispatchEvent(new CustomEvent("nexo-toast", { detail: "Paste is disabled in the report. Type your answer." }));
  },
  onDrop: (e: React.DragEvent) => e.preventDefault(),
};
