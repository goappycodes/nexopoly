"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DocKind } from "@/lib/types";

export function Icon({ name, className = "", fill = false, size }: { name: string; className?: string; fill?: boolean; size?: number }) {
  return (
    <span className={`msi ${fill ? "fill" : ""} ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden>
      {name}
    </span>
  );
}

/** NEXIS logo in the slot where Drive's own logo sits. */
export function Brand({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nexis-icon.png" alt="NEXIS" className="h-9 w-9 object-contain" draggable={false} />
      {!compact && (
        <span className={`font-display text-[22px] leading-none tracking-[-0.01em] ${dark ? "text-[#E3E3E3]" : "text-ink2"}`}>Nexopoly</span>
      )}
    </div>
  );
}

export const KIND_ICON: Record<DocKind, { icon: string; color: string; label: string }> = {
  sheet: { icon: "table_chart", color: "#188038", label: "Spreadsheet" },
  pdf: { icon: "picture_as_pdf", color: "#D93025", label: "PDF" },
  scan: { icon: "image", color: "#D93025", label: "Scanned image" },
  email: { icon: "mail", color: "#1A73E8", label: "Email" },
  chat: { icon: "chat", color: "#1E8E3E", label: "Message" },
};

export function FileIcon({ kind, size = 22 }: { kind: DocKind; size?: number }) {
  const k = KIND_ICON[kind] ?? KIND_ICON.pdf;
  return <Icon name={k.icon} fill size={size} className="shrink-0" />;
}
export function FileIconColored({ kind, size = 22 }: { kind: DocKind; size?: number }) {
  const k = KIND_ICON[kind] ?? KIND_ICON.pdf;
  return (
    <span style={{ color: k.color }} className="inline-flex">
      <Icon name={k.icon} fill size={size} />
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "filled",
  disabled,
  className = "",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "filled" | "tonal" | "outlined" | "text" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const styles = {
    filled: "bg-primary text-white hover:bg-primaryHover hover:shadow-e1",
    tonal: "bg-selected text-[#001D35] hover:shadow-e1",
    outlined: "border border-outline text-primary hover:bg-[#0B57D00F]",
    text: "text-primary hover:bg-[#0B57D014]",
    danger: "bg-danger text-white hover:shadow-e1",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium tracking-[0.01em] transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon, onClick, title, className = "", disabled }: { icon: string; onClick?: () => void; title: string; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-ink2 transition hover:bg-[#1F1F1F14] disabled:opacity-30 ${className}`}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Chip({ children, active, onClick, icon }: { children: ReactNode; active?: boolean; onClick?: () => void; icon?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${
        active ? "border-transparent bg-selected text-[#001D35]" : "border-outline text-ink2 hover:bg-[#1F1F1F0A]"
      }`}
    >
      {active ? <Icon name="check" size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

export function Dialog({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="anim-in max-h-[90vh] w-full overflow-auto rounded-[28px] bg-[#F8FAFD] p-6 shadow-e3 scroll-thin" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 font-display text-2xl text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function Snackbar({ message, onClose, action }: { message: string | null; onClose: () => void; action?: ReactNode }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="anim-in fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-4 rounded-lg bg-[#303030] px-4 py-3 text-sm text-[#F2F2F2] shadow-e3">
      <span>{message}</span>
      {action}
      <button className="text-[#A8C7FA]" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
  className = "",
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label className={`group relative block ${className}`}>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder ?? " "}
        onChange={(e) => onChange(e.target.value)}
        className="peer h-14 w-full rounded border border-outline bg-transparent px-4 pt-1 text-base text-ink outline-none transition focus:border-2 focus:border-primary"
      />
      <span className="pointer-events-none absolute left-3 top-[-9px] bg-inherit px-1 text-xs text-ink2 peer-focus:text-primary" style={{ background: "var(--field-bg, #fff)" }}>
        {label}
      </span>
    </label>
  );
}

/** Server-synced clock: offset is learned from the `now` field every API response carries. */
let offset = 0;
export const serverNow = () => Date.now() + offset;
export function learnOffset(serverIso: string | undefined, sentAt: number) {
  if (!serverIso) return;
  const mid = (sentAt + Date.now()) / 2;
  const next = Date.parse(serverIso) - mid;
  offset = Math.abs(next - offset) > 400 ? next : offset * 0.7 + next * 0.3;
}

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const sentAt = Date.now();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  learnOffset(data?.now, sentAt);
  if (!res.ok) {
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/** Re-renders every `ms` so countdowns tick. */
export function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return serverNow();
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function remainingMs(state: { phaseEndsAt: string | null; paused: boolean; pausedRemainingMs: number | null }, now: number) {
  if (state.paused) return state.pausedRemainingMs ?? 0;
  if (!state.phaseEndsAt) return null;
  return Date.parse(state.phaseEndsAt) - now;
}

export const inr = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return (n < 0 ? "-₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

export const ago = (iso: string, now: number) => {
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : `${m} min`;
};

/** Plays a short two-note chime (no audio file needed). */
export function chime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch {}
}

export function usePrevious<T>(v: T) {
  const r = useRef<T>();
  useEffect(() => {
    r.current = v;
  });
  return r.current;
}
