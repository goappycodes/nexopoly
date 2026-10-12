"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { api } from "./ui";

let channel: any = null;
const listeners = new Set<(scope: string) => void>();

/** One shared Supabase broadcast subscription. Messages only say "something changed"; data always comes from our API. */
function subscribe(fn: (scope: string) => void) {
  listeners.add(fn);
  if (!channel && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    channel = sb
      .channel("nexopoly")
      .on("broadcast", { event: "ping" }, (msg: any) => listeners.forEach((l) => l(msg?.payload?.scope ?? "")))
      .subscribe();
  }
  return () => listeners.delete(fn);
}

/** Polls an endpoint and refetches immediately on any broadcast ping. */
export function useLive<T>(url: string, intervalMs: number, opts?: { onError?: (e: any) => void }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<any>(null);
  const inflight = useRef(false);
  const again = useRef(false);
  const onError = useRef(opts?.onError);
  onError.current = opts?.onError;

  const load = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const d = await api<T>(url);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e);
      onError.current?.(e);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        load();
      }
    }
  }, [url]);

  useEffect(() => {
    load();
    const t = setInterval(load, intervalMs);
    const unsub = subscribe(() => load());
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      unsub();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load, intervalMs]);

  return { data, error, reload: load, setData };
}
