"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyReport, type Phase, type ReportData } from "@/lib/types";
import { api } from "../ui";

const SCALARS = ["summary", "cashLeakage", "adjustedOcf"] as const;
type Scalar = (typeof SCALARS)[number];

interface Meta {
  status: string;
  submitted_at: string | null;
  auto_submitted: boolean;
}

/**
 * One report shared by every laptop of a team. Each laptop tracks which fields and finding rows
 * it changed and saves only those; the server merges them. Teammates' saves arrive through the
 * state poll (report.updated_at) and are pulled in whenever this laptop has nothing unsaved.
 */
export function useSharedReport(enabled: boolean, phase: Phase | undefined, serverStamp: string | null | undefined, serverStatus: string | undefined) {
  const [report, setState] = useState<ReportData>(emptyReport());
  const [meta, setMeta] = useState<Meta>({ status: "not_started", submitted_at: null, auto_submitted: false });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ref = useRef(report);
  const loaded = useRef(false);
  const stamp = useRef<string | null>(null);
  const inflight = useRef(false);
  // Changed keys -> edit version: "summary", "cashLeakage", "adjustedOcf", "f:<row id>", "d:<row id>".
  const dirty = useRef(new Map<string, number>());
  const version = useRef(0);

  const mark = (k: string) => dirty.current.set(k, ++version.current);

  const apply = (next: ReportData) => {
    ref.current = next;
    setState(next);
  };

  const pull = useCallback(async () => {
    if (inflight.current || dirty.current.size) return;
    const r = await api<{ report: ReportData; updated_at: string | null } & Meta>("/api/team/report");
    if (dirty.current.size) return; // edited while loading: the next save merges instead
    apply(r.report);
    stamp.current = r.updated_at;
    setMeta({ status: r.status, submitted_at: r.submitted_at, auto_submitted: r.auto_submitted });
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (enabled && !loaded.current) pull().catch(() => {});
  }, [enabled, pull]);

  // A teammate saved, or the report was submitted: refresh.
  useEffect(() => {
    if (!loaded.current) return;
    if ((serverStamp && serverStamp !== stamp.current) || (serverStatus === "submitted" && meta.status !== "submitted")) pull().catch(() => {});
  }, [serverStamp, serverStatus, meta.status, pull]);

  /** Local edit: records what changed so only that is sent. */
  const setReport = useCallback((fn: (r: ReportData) => ReportData) => {
    const prev = ref.current;
    const next = fn(prev);
    for (const k of SCALARS) if (prev[k] !== next[k]) mark(k);
    const before = new Map(prev.findings.map((f) => [f.id, JSON.stringify(f)]));
    for (const f of next.findings) if (before.get(f.id) !== JSON.stringify(f)) mark(`f:${f.id}`);
    const now = new Set(next.findings.map((f) => f.id));
    for (const f of prev.findings) {
      if (!now.has(f.id)) {
        dirty.current.delete(`f:${f.id}`);
        mark(`d:${f.id}`);
      }
    }
    apply(next);
  }, []);

  /** Re-applies this laptop's not-yet-saved edits on top of a merged server copy. */
  const overlay = (server: ReportData, keys: [string, number][]) => {
    const out: ReportData = { ...server, findings: [...server.findings] };
    const local = ref.current;
    for (const [k] of keys) {
      if ((SCALARS as readonly string[]).includes(k)) (out as any)[k] = local[k as Scalar];
      else if (k.startsWith("d:")) out.findings = out.findings.filter((f) => f.id !== k.slice(2));
      else if (k.startsWith("f:")) {
        const row = local.findings.find((f) => f.id === k.slice(2));
        if (!row) continue;
        const i = out.findings.findIndex((f) => f.id === row.id);
        if (i >= 0) out.findings[i] = row;
        else out.findings.push(row);
      }
    }
    return out;
  };

  const save = useCallback(async () => {
    if (inflight.current || !loaded.current || !dirty.current.size) return;
    if (phase !== "audit" && phase !== "report") return;
    inflight.current = true;
    setSaving(true);
    const sent = new Map(dirty.current);
    const local = ref.current;
    const patch: Record<string, unknown> = {};
    const findings = [];
    const deleted = [];
    for (const k of sent.keys()) {
      if ((SCALARS as readonly string[]).includes(k)) patch[k] = local[k as Scalar];
      else if (k.startsWith("d:")) deleted.push(k.slice(2));
      else if (k.startsWith("f:")) {
        const row = local.findings.find((f) => f.id === k.slice(2));
        if (row) findings.push(row);
      }
    }
    if (findings.length) patch.findings = findings;
    if (deleted.length) patch.deleted = deleted;
    try {
      const r = await api<{ report: ReportData; updated_at: string }>("/api/team/report", { method: "PUT", json: { patch } });
      for (const [k, v] of sent) if (dirty.current.get(k) === v) dirty.current.delete(k);
      apply(overlay(r.report, Array.from(dirty.current.entries())));
      stamp.current = r.updated_at;
      setSavedAt(r.updated_at);
    } catch (e: any) {
      // Locked or already submitted: drop local edits and show the stored report.
      if (e.status === 403) {
        dirty.current.clear();
        inflight.current = false;
        await pull().catch(() => {});
      }
    } finally {
      inflight.current = false;
      setSaving(false);
    }
  }, [phase, pull]);

  useEffect(() => {
    const t = setInterval(() => save(), 3000);
    return () => clearInterval(t);
  }, [save]);

  const submit = useCallback(async () => {
    await save();
    await api("/api/team/report/submit", { method: "POST", json: {} });
    dirty.current.clear();
    await pull();
  }, [save, pull]);

  return { report, setReport, meta, savedAt, saving, save, submit, reload: pull };
}
