import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Service-role client. Server only: it bypasses RLS. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Throws on a Supabase error so routes fail loudly instead of returning partial data. */
export function must<T>(res: { data: T; error: any }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message || String(res.error));
  return res.data as NonNullable<T>;
}

/** Tells every open screen that something changed, so it refetches now instead of at the next poll. */
export async function ping(scope: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages: [{ topic: "nexopoly", event: "ping", payload: { scope } }] }),
      cache: "no-store",
    });
  } catch {
    // Polling picks the change up anyway.
  }
}

export async function logActivity(teamId: string | null, eventType: string, docId?: string | null, detail?: unknown) {
  await db().from("activity_log").insert({ team_id: teamId, event_type: eventType, doc_id: docId ?? null, detail: detail ?? null });
}
