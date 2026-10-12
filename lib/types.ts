// Types shared by server routes and client screens.

export type Phase = "lobby" | "briefing" | "audit" | "report" | "closed" | "pitches" | "reveal" | "results";

export const PHASES: { id: Phase; label: string; minutes?: number }[] = [
  { id: "lobby", label: "Waiting to start" },
  { id: "briefing", label: "Briefing", minutes: 10 },
  { id: "audit", label: "Audit", minutes: 55 },
  { id: "report", label: "Report", minutes: 15 },
  { id: "closed", label: "Submissions closed" },
  { id: "pitches", label: "Pitches" },
  { id: "reveal", label: "Reveal" },
  { id: "results", label: "Results" },
];

export const phaseLabel = (p: Phase) => PHASES.find((x) => x.id === p)?.label ?? p;

export type DocKind = "sheet" | "pdf" | "scan" | "email" | "chat";

export interface ManifestDoc {
  docId: string;
  folder: string;
  title: string;
  kind: DocKind;
  owner: string;
  modified: string;
  pages: number;
  width: number;
  height: number;
  inject?: number;
}

export interface PublicState {
  phase: Phase;
  phaseEndsAt: string | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  queueOpen: boolean;
  cfoOpen: boolean;
  inject1At: string | null;
  inject2At: string | null;
  inject2Deadline: string | null;
  announcement: string | null;
  announcementAt: string | null;
  vishalSessionsPerTeam: number;
}

export type FindingType = "Error" | "Leakage" | "Misrepresentation";
export type FindingStatus = "Proven" | "Needs verification";
export type ImpactOn = "Profit" | "Cash" | "Balance sheet" | "Not quantified";
export type Recommendation = "" | "Invest at proposed terms" | "Invest with conditions" | "Walk away";

export interface Finding {
  id: string;
  title: string;
  description: string;
  evidence: string[];
  type: FindingType | "";
  status: FindingStatus | "";
  impact: number | null;
  impactOn: ImpactOn | "";
}

export interface Adjustment {
  description: string;
  amount: number | null;
  sign: "+" | "-";
}

export interface ClearedItem {
  item: string;
  docId: string;
  reason: string;
}

export interface ReportData {
  summary: string;
  recommendation: Recommendation;
  findings: Finding[];
  adjustments: Adjustment[];
  cashLeakage: number | null;
  adjustedOcf: number | null;
  cleared: ClearedItem[];
  inject2Response: string;
  conditions: string[];
}

export const LIMITS = {
  summaryWords: 150,
  findingWords: 60,
  findings: 15,
  adjustments: 8,
  cleared: 5,
  inject2Words: 80,
  conditionWords: 40,
  conditions: 3,
};

export const emptyReport = (): ReportData => ({
  summary: "",
  recommendation: "",
  findings: [],
  adjustments: [],
  cashLeakage: null,
  adjustedOcf: null,
  cleared: [],
  inject2Response: "",
  conditions: ["", "", ""],
});

export const NOTE_TAGS = ["Error", "Leakage", "Misrepresentation"] as const;
export const NOTE_STATUS = ["Proven", "Needs verification"] as const;

export interface Note {
  id: string;
  doc_id: string;
  page_no: number;
  x: number | null;
  y: number | null;
  text: string;
  tag: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
