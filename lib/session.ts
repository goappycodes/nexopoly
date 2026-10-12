import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";

const COOKIE = "nexo_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export type Role = "team" | "admin" | "display" | "faculty";
export interface Session {
  role: Role;
  teamId?: string;
  sid?: string;
}

export async function sign(payload: Record<string, unknown>, ttl: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(secret());
}

export async function verify<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function setSession(res: NextResponse, s: Session) {
  const token = await sign({ ...s }, "14h");
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 3600,
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
}

export async function readSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return verify<Session>(token);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAdmin() {
  const s = await readSession();
  if (s?.role !== "admin") throw new HttpError(401, "Admin sign-in required");
  return s;
}

export async function requireDisplay() {
  const s = await readSession();
  if (s?.role !== "display" && s?.role !== "admin") throw new HttpError(401, "Display sign-in required");
  return s;
}

/** Faculty reviewers see every document and the answer key. Admins can open the same page. */
export async function requireFaculty() {
  const s = await readSession();
  if (s?.role !== "faculty" && s?.role !== "admin") throw new HttpError(401, "Faculty sign-in required");
  return s;
}

/**
 * Looks up one signed-in laptop. Each team member can sign in on their own laptop (up to the
 * admin's limit); a laptop signed out by the limit or by the admin no longer has a row.
 * Sessions created before multi-laptop sign-in only exist as teams.active_session_id and are
 * adopted into team_sessions on first use.
 */
export async function findDevice(teamId: string, sid: string | undefined, legacySid?: string | null) {
  if (!sid) return null;
  const { data } = await db().from("team_sessions").select("id,member,last_seen_at").eq("id", sid).eq("team_id", teamId).maybeSingle();
  if (data) return data as { id: string; member: string | null; last_seen_at: string };
  if (legacySid && legacySid === sid) {
    const row = { id: sid, team_id: teamId, member: null };
    await db().from("team_sessions").upsert(row);
    return { id: sid, member: null, last_seen_at: new Date().toISOString() };
  }
  return null;
}

/** Returns the signed-in team and this laptop's session. A signed-out laptop is rejected with 409. */
export async function requireTeam() {
  const s = await readSession();
  if (s?.role !== "team" || !s.teamId) throw new HttpError(401, "Team sign-in required");
  const { data: team } = await db().from("teams").select("*").eq("id", s.teamId).maybeSingle();
  if (!team) throw new HttpError(401, "Team not found");
  const device = await findDevice(team.id, s.sid, team.active_session_id);
  if (!device) throw new HttpError(409, "session_replaced");
  return { ...(team as TeamRow), session_id: device.id, member: device.member, device_seen_at: device.last_seen_at };
}

export interface TeamRow {
  id: string;
  name: string;
  code: string;
  table_no: string | null;
  members: string[];
  vishal_used: number;
  vishal_extra: number;
  cfo_used: number;
  active_session_id: string | null;
  last_seen_at: string | null;
  session_id?: string;
  member?: string | null;
  device_seen_at?: string;
}

/** Wraps a route handler: converts thrown HttpErrors into JSON responses and stamps server time. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return NextResponse.json({ ...(out as object), now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return NextResponse.json({ error: e.message || "Server error", now: new Date().toISOString() }, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}
