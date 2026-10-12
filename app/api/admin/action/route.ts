import { randomInt } from "crypto";
import { db, must, ping } from "@/lib/db";
import { HttpError, handler, requireAdmin } from "@/lib/session";
import { extendPhase, getEvent, pausePhase, resumePhase, setPhase, updateEvent } from "@/lib/state";
import { SESSION_MS, openRequests, thirdPlace } from "@/lib/queue";
import { gradeTeam } from "@/lib/grading";
import { autoSubmitAll } from "@/lib/reports";
import { PHASES, type Phase } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PEAKS = [
  "Kanchenjunga", "Makalu", "Lhotse", "Annapurna", "Dhaulagiri", "Nanda Devi", "Kamet", "Trishul", "Pandim", "Kabru",
  "Siniolchu", "Jongsong", "Chomolhari", "Shivling", "Nun Kun", "Satopanth", "Chaukhamba", "Bandarpunch", "Kedarnath", "Neelkanth",
  "Tiger Hill", "Sandakphu", "Phalut", "Singalila", "Kalimpong", "Teesta", "Rangit", "Mahananda", "Torsa", "Jaldhaka",
];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const POST = handler(async (req: Request) => {
  await requireAdmin();
  const b = await req.json();
  const a = String(b.action ?? "");
  const now = new Date().toISOString();

  switch (a) {
    // ---------- setup ----------
    case "setup_teams": {
      const count = Math.min(Math.max(1, Number(b.count) || 0), PEAKS.length);
      const existing = must(await db().from("teams").select("name,code")) as { name: string; code: string }[];
      const names = new Set(existing.map((t) => t.name));
      const codes = new Set(existing.map((t) => t.code));
      const rows = [];
      for (const name of PEAKS) {
        if (names.size + rows.length >= count) break;
        if (names.has(name)) continue;
        let code = newCode();
        while (codes.has(code)) code = newCode();
        codes.add(code);
        rows.push({ name, code });
      }
      if (rows.length) must(await db().from("teams").insert(rows));
      await ping("teams");
      return { ok: true, added: rows.length };
    }
    case "delete_team": {
      must(await db().from("teams").delete().eq("id", b.teamId));
      await ping("teams");
      return { ok: true };
    }
    case "reset_code": {
      must(await db().from("teams").update({ code: newCode(), active_session_id: null }).eq("id", b.teamId));
      return { ok: true };
    }
    case "force_logout": {
      must(await db().from("teams").update({ active_session_id: null }).eq("id", b.teamId));
      return { ok: true };
    }
    case "reset_event": {
      if (b.confirm !== "RESET") throw new HttpError(400, "Type RESET to confirm.");
      for (const t of ["grades", "team_scores", "reports", "inbox_reads", "cfo_questions", "expert_requests", "notes"]) {
        must(await db().from(t).delete().not("team_id", "is", null));
      }
      must(await db().from("activity_log").delete().gte("id", 0));
      must(await db().from("teams").delete().not("id", "is", null));
      await ping("teams");
      await updateEvent({
        phase: "lobby", phase_started_at: null, phase_ends_at: null, paused: false, paused_remaining_ms: null, queue_open: false,
        inject1_at: null, announcement: null, announcement_at: null, pitch_order: [], pitch_index: 0,
        pitch_ends_at: null, pitch_paused_remaining_ms: null, leaderboard_published: false,
      });
      await db().storage.from("reports").list().then(async ({ data }) => {
        if (data?.length) await db().storage.from("reports").remove(data.map((f) => f.name));
      });
      await ping("state");
      return { ok: true };
    }

    // ---------- event control ----------
    case "phase": {
      const phase = b.phase as Phase;
      if (!PHASES.some((p) => p.id === phase)) throw new HttpError(400, "Unknown phase");
      await setPhase(phase);
      return { ok: true };
    }
    case "pause": await pausePhase(); return { ok: true };
    case "resume": await resumePhase(); return { ok: true };
    case "extend": await extendPhase(Number(b.minutes) || 5); return { ok: true };
    case "inject1": {
      const e = await getEvent();
      if (!e.inject1_at) await updateEvent({ inject1_at: now });
      return { ok: true };
    }
    case "toggle": {
      if (b.key !== "queue_open") throw new HttpError(400, "Unknown toggle");
      await updateEvent({ [b.key]: !!b.value } as any);
      return { ok: true };
    }
    case "announce": {
      const text = String(b.text ?? "").trim().slice(0, 200);
      await updateEvent({ announcement: text || null, announcement_at: text ? now : null });
      return { ok: true };
    }
    case "close_submissions": {
      await setPhase("closed");
      return { ok: true };
    }
    case "auto_submit": {
      await autoSubmitAll();
      return { ok: true };
    }

    // ---------- Vishal queue ----------
    case "queue_start": {
      const open = await openRequests();
      if (open.some((r) => r.status === "in_session")) throw new HttpError(409, "The expert is already in a meeting. End it first.");
      const target = b.id ? open.find((r) => r.id === b.id) : open.find((r) => r.status === "waiting");
      if (!target) throw new HttpError(404, "No team is waiting.");
      must(
        await db()
          .from("expert_requests")
          .update({ status: "in_session", started_at: now, ends_at: new Date(Date.now() + SESSION_MS).toISOString() })
          .eq("id", target.id)
          .eq("status", "waiting"),
      );
      await ping("queue");
      return { ok: true };
    }
    case "queue_end": {
      must(await db().from("expert_requests").update({ status: "done", ended_at: now }).eq("id", b.id).eq("status", "in_session"));
      await ping("queue");
      return { ok: true };
    }
    case "queue_note": {
      must(await db().from("expert_requests").update({ expert_note: String(b.note ?? "").slice(0, 200) }).eq("id", b.id));
      await ping("queue");
      return { ok: true };
    }
    case "queue_skip": {
      const open = await openRequests();
      const r = open.find((x) => x.id === b.id);
      if (!r) throw new HttpError(404, "Request not found");
      if (r.skip_count >= 1) {
        must(await db().from("expert_requests").update({ status: "skipped", ended_at: now, started_at: null, ends_at: null }).eq("id", r.id));
      } else {
        const waiting = open.filter((x) => x.status === "waiting" && x.id !== r.id);
        must(
          await db()
            .from("expert_requests")
            .update({ status: "waiting", skip_count: 1, position: thirdPlace(waiting), started_at: null, ends_at: null })
            .eq("id", r.id),
        );
      }
      await ping("queue");
      return { ok: true };
    }
    case "queue_cancel": {
      must(await db().from("expert_requests").update({ status: "cancelled", ended_at: now }).eq("id", b.id).in("status", ["waiting", "in_session"]));
      await ping("queue");
      return { ok: true };
    }
    case "queue_move": {
      const waiting = (await openRequests()).filter((r) => r.status === "waiting");
      const i = waiting.findIndex((r) => r.id === b.id);
      const j = b.dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= waiting.length) return { ok: true };
      must(await db().from("expert_requests").update({ position: waiting[j].position }).eq("id", waiting[i].id));
      must(await db().from("expert_requests").update({ position: waiting[i].position }).eq("id", waiting[j].id));
      await ping("queue");
      return { ok: true };
    }
    case "add_session": {
      const t = must(await db().from("teams").select("vishal_extra").eq("id", b.teamId).single()) as any;
      must(await db().from("teams").update({ vishal_extra: (t.vishal_extra ?? 0) + (b.remove ? -1 : 1) }).eq("id", b.teamId));
      await ping("queue");
      return { ok: true };
    }

    // ---------- pitches ----------
    case "pitch_order": {
      const teams = must(await db().from("teams").select("id,name,table_no")) as any[];
      let order = teams;
      if (b.mode === "random") order = [...teams].sort(() => Math.random() - 0.5);
      else order = [...teams].sort((x, y) => (Number(x.table_no) || 999) - (Number(y.table_no) || 999) || x.name.localeCompare(y.name));
      await updateEvent({ pitch_order: order.map((t) => t.id), pitch_index: 0, pitch_ends_at: null, pitch_paused_remaining_ms: null });
      return { ok: true };
    }
    case "pitch_start": {
      await updateEvent({ pitch_ends_at: new Date(Date.now() + (Number(b.seconds) || 120) * 1000).toISOString(), pitch_paused_remaining_ms: null });
      return { ok: true };
    }
    case "pitch_stop": {
      await updateEvent({ pitch_ends_at: null, pitch_paused_remaining_ms: null });
      return { ok: true };
    }
    case "pitch_next":
    case "pitch_prev": {
      const e = await getEvent();
      const idx = Math.min(Math.max(0, e.pitch_index + (a === "pitch_next" ? 1 : -1)), Math.max(0, e.pitch_order.length - 1));
      await updateEvent({ pitch_index: idx, pitch_ends_at: null, pitch_paused_remaining_ms: null });
      return { ok: true };
    }

    // ---------- grading and results ----------
    case "grade": {
      const out = await gradeTeam(String(b.teamId));
      return { ok: true, ...out };
    }
    case "accept": {
      const patch: Record<string, unknown> = { team_id: b.teamId, accepted: true, updated_at: now };
      if (b.final_ai !== undefined && b.final_ai !== null && b.final_ai !== "") {
        const v = Number(b.final_ai);
        if (!Number.isFinite(v) || v < 0 || v > 50) throw new HttpError(400, "Report marks must be 0–50.");
        if (!String(b.reason ?? "").trim()) throw new HttpError(400, "Give a reason for the edit.");
        patch.final_ai = v;
        patch.edit_reason = String(b.reason).slice(0, 300);
      }
      must(await db().from("team_scores").upsert(patch));
      await ping("grades");
      return { ok: true };
    }
    case "pitch_marks": {
      const v = Number(b.marks);
      if (!Number.isFinite(v) || v < 0 || v > 20) throw new HttpError(400, "Pitch marks must be 0–20.");
      must(await db().from("team_scores").upsert({ team_id: b.teamId, pitch_marks: v, updated_at: now }));
      await ping("grades");
      return { ok: true };
    }
    case "vishal_marks": {
      const v = Number(b.marks);
      if (!Number.isFinite(v) || v < 0 || v > 30) throw new HttpError(400, "Expert marks must be 0–30.");
      must(await db().from("team_scores").upsert({ team_id: b.teamId, vishal_marks: v, updated_at: now }));
      await ping("grades");
      return { ok: true };
    }
    case "publish_leaderboard": {
      await updateEvent({ leaderboard_published: !!b.value });
      return { ok: true };
    }
  }
  throw new HttpError(400, `Unknown action: ${a}`);
});
