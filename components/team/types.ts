import type { ManifestDoc, PublicState } from "@/lib/types";

export interface InboxDoc extends ManifestDoc {
  read: boolean;
}

export interface TeamState {
  now: string;
  state: PublicState;
  team: { name: string; code: string; table_no: string | null; members: string[] };
  access: "readme" | "all" | "locked";
  files: ManifestDoc[];
  inbox: InboxDoc[];
  citable: string[];
  claimedPbt: number;
  company: string;
  vishal: {
    limit: number;
    used: number;
    request: null | {
      id: string;
      status: "waiting" | "in_session";
      question: string;
      doc_ids: string[];
      position: number | null;
      waitMin: number | null;
      endsAt: string | null;
    };
    queueLength: number;
    busy: boolean;
    history: { question: string; doc_ids: string[]; status: string; expert_note: string | null; created_at: string; ended_at: string | null }[];
  };
  cfo: { used: number; limit: number; items: { id: string; question: string; answer: string; created_at: string }[] };
  report: { status: string; submitted_at?: string | null; auto_submitted?: boolean };
}

export type View =
  | { kind: "drive"; folder: string | null }
  | { kind: "doc"; docId: string; page?: number; from?: View }
  | { kind: "notes" }
  | { kind: "report" }
  | { kind: "desk" }
  | { kind: "inbox" };
