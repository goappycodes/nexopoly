import { handler, requireFaculty } from "@/lib/session";
import { MANIFEST, CASE_PUBLIC } from "@/lib/manifest";
import { answerKey } from "@/lib/answerKey";

export const dynamic = "force-dynamic";

/** Everything the faculty reviewer sees: every case document and the planted anomalies. */
export const GET = handler(async () => {
  await requireFaculty();
  let key = null;
  let keyError: string | null = null;
  try {
    const k = await answerKey();
    key = {
      claimed: k.claimed,
      restated: k.restated,
      issues: k.issues,
      red_herrings: k.red_herrings,
    };
  } catch (e: any) {
    keyError = e.message;
  }
  return { company: CASE_PUBLIC.company, docs: MANIFEST, key, keyError };
});
