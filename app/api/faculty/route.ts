import { handler, requireFaculty } from "@/lib/session";
import { MANIFEST, CASE_PUBLIC } from "@/lib/manifest";
import { answerKey } from "@/lib/answerKey";
import { listFeedback } from "@/lib/facultyFeedback";

export const dynamic = "force-dynamic";

/** Everything the faculty reviewer needs: all documents, the planted anomalies and their saved feedback. */
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
      recommendation: { best: k.recommendation?.best ?? [], conditions_that_count: k.recommendation?.conditions_that_count ?? [] },
    };
  } catch (e: any) {
    keyError = e.message;
  }
  return {
    company: CASE_PUBLIC.company,
    claimedPbt: CASE_PUBLIC.claimed_pbt,
    docs: MANIFEST,
    key,
    keyError,
    feedback: await listFeedback(),
  };
});
