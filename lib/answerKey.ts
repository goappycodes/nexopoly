import "server-only";
import { db } from "./db";

// The answer key lives only in the private "secure" storage bucket. It is never in
// the repo or a client bundle, and only admin, display (reveal) and grading code reads it.

export interface AnswerKey {
  claimed: { revenue?: number; pbt: number; pat: number; operating_cash_flow: number };
  restated: {
    pbt: number;
    pbt_accept_min: number;
    pbt_accept_max: number;
    cash_leakage: number;
    cash_leakage_tolerance_pct: number;
    operating_cash_flow: number;
    ocf_tolerance: number;
    workings?: { label: string; amount: number }[];
  };
  issues: {
    id: string;
    level: string;
    points: number;
    title: string;
    type: string;
    evidence_any: string[];
    evidence_strong: string[];
    must_identify: string;
    partial_credit: string;
    rupee_impact: number;
    impact_on: string;
  }[];
  red_herrings: { id: string; title: string; penalty: number; penalise_if: string; no_penalty_if: string }[];
  recommendation: { best: string[]; conditions_that_count: string[]; inject2_correct_response?: string };
  cfo_answers: { topic: string; keywords: string[]; answer: string }[];
  cfo_fallback?: string;
}

let cached: { key: AnswerKey; at: number } | null = null;

export async function answerKey(): Promise<AnswerKey> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.key;
  const { data, error } = await db().storage.from("secure").download("answer_key.json");
  if (error || !data) throw new Error("Answer key not uploaded yet");
  const key = JSON.parse(await data.text()) as AnswerKey;
  cached = { key, at: Date.now() };
  return key;
}

