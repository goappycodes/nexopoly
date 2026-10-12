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

/** Returns the signed-in team. A session replaced by a newer login on another device is rejected. */
export async function requireTeam() {
  const s = await readSession();
  if (s?.role !== "team" || !s.teamId) throw new HttpError(401, "Team sign-in required");
  const { data: team } = await db().from("teams").select("*").eq("id", s.teamId).maybeSingle();
  if (!team) throw new HttpError(401, "Team not found");
  if (team.active_session_id !== s.sid) throw new HttpError(409, "session_replaced");
  return team as TeamRow;
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
