# Nexopoly: build plan

Nexopoly is the web app for the NEXIS School of Business finance hackathon on **13 October 2026**: a two-hour forensic audit challenge. It is built from *The Diligence Room: Build Brief* (the PDF is kept locally, not in git), with the changes the organiser asked for below.

> **This repository is public.** It holds the platform only. The case generator, case data and answer key are in `case/`, which is gitignored and backed up to private Supabase storage (see [STATUS.md](STATUS.md)). Never commit anything that reveals the planted issues.

## 1. Decisions that override the brief

| Topic | Brief | Decision |
|---|---|---|
| Name | The Diligence Room | **Nexopoly** |
| Look | — | Looks exactly like Google Drive (Material 3). The only branding is the NEXIS logo, placed where the Drive logo would be. No Google logos or product names. |
| Team size | 4–5 | **3 per team** |
| Documents | 45–60 files | **22 files, about 36 pages**, so a team of 3 can read them all in the 55-minute audit. Related documents are bundled into multi-page files. |
| Emails folder | EM-01 to EM-05 plus routine emails | **Removed.** What the emails showed about intent is now carried by remarks inside the documents. |
| Policies folder | POL-01 | **Removed.** Control rules are printed on the documents they govern. |
| Evidence Locker | 8 cards, 100 credits | **Removed**, along with credits. Every issue can be proved from the free files. |
| Expert console | Vishal's phone screen with a hint sheet | **Removed.** Vishal has no screen and no hint sheet; he decides his own hints. The queue runs on the projector, and the admin presses **Start** when Vishal sits with a team. When the 2 minutes are up, "Time up" tells Vishal to move to the next team. |
| Fallback | Printed case pack if P0 isn't ready by 9:00 | No fallback plan. Everything ships. |
| Grader temperature | 0 | Claude Opus 5.5 does not accept `temperature`. Consistency comes from structured JSON output plus two runs per report, with a gap over 5 marks flagged for human review. |

## 2. Roles

| Role | Login | Device | Screens |
|---|---|---|---|
| Team | Team name + 6-character code (plus table number and member names on first sign-in) | One laptop per team | Drive, document viewer, notes, Ask Vishal, Accounts desk, Inbox, report builder, top bar with phase timer |
| Admin | `ADMIN_PASSWORD` | Laptop | Event control, live teams, Vishal queue, Accounts desk overrides, grading and results, setup, exports |
| Display | `DISPLAY_PIN` | Projector | Phase and countdown, Vishal queue and session timer, announcements, inject alerts, pitch timer, answer reveal, leaderboard |

A second login with the same team code ends the first session; the first device sees "Signed in on another device", and the second login is logged.

## 3. Event flow (driven from the admin console)

| Clock | Admin action | What happens |
|---|---|---|
| 0:00 | Open briefing | Teams see only "00 Read Me". 10-minute countdown. |
| 0:10 | Start audit | All folders unlock. 55-minute timer. The findings table in the report opens. Vishal's queue opens automatically. |
| 0:20 | Desk toggle on | Teams can send 2 written questions to the Accounts Manager. |
| 0:35 | Push Inject 1 | Whistleblower email lands in every Inbox with a banner and chime. The projector shows "New message received". |
| 1:00 | Desk toggle off | |
| 1:05 | Open report | The full report opens with a 15-minute timer. |
| 1:15 | Queue toggle off | |
| 1:20 | Close submissions (also automatic when the report timer ends) | Reports lock. Unsubmitted drafts are auto-submitted and flagged. The Drive locks. |
| 1:20–1:45 | Start pitches | Projector shows the pitch order and a 2-minute timer that turns red at 15 seconds. |
| 1:45 | Reveal | Projector shows the answer summary. |
| 1:55 | Show results | Leaderboard, once published in Grading. |

The admin can pause, resume, or extend any timed phase by 5 minutes. Every timer reads server time (each API response carries `now`, and clients keep an offset).

## 4. Case documents (22 files)

| Folder | Doc IDs |
|---|---|
| 00 Read Me | RM-01 |
| 01 Financial Statements | FS-01, FS-02, FS-03, FS-04, FS-05 |
| 02 Sales | SL-01, SL-02, SL-03 (invoice bundle) |
| 03 Purchases | PR-01, PR-02, PR-03, PR-04 (bills bundle) |
| 04 Bank | BNK-01, BNK-02 |
| 05 Payroll and HR | HR-01, HR-02 |
| 06 Petty Cash | PC-01, PC-02 (scanned vouchers) |
| 07 Inventory | STK-01 |
| 08 Company | CO-01, CO-02 |
| Inbox | INJ-01 (pre-rendered) |

Pipeline (in `case/`, local only): case-data model → validation of every reconciliation rule → HTML templates → Playwright renders each page to a 150 dpi PNG with a faint CONFIDENTIAL mark → `npm run case:upload` pushes the pages and the answer key to private Supabase storage, and copies `manifest.json` and `public.json` (titles and claimed PBT only) into `data/`.

## 5. Anti-copy and integrity controls

| # | Control | Implementation |
|---|---|---|
| 1 | Image rendering | Pages are PNGs. The viewer draws them onto a `<canvas>`, so no document text is ever in the DOM. |
| 2 | Authenticated serving | `/api/team/page` issues a 60-second signed token. `/api/img` checks that token **and** the team's live session cookie. A copied URL fails in another browser. |
| 3 | Watermark | The server burns team name, code and time into every page (satori + sharp). The client also tiles a live team · code · seconds overlay at 8% opacity. |
| 4 | Input blocking | Selection, right-click, drag and Ctrl/Cmd + C, A, X, S, P, U are blocked outside form fields, and each attempt is logged. Print CSS shows "Printing disabled". |
| 5 | Focus blur | Removed on 12 Oct: switching windows no longer blurs or logs anything. |
| 6 | Paste blocking | Paste and drop are blocked in every report field. Notes accept a paste only of text copied from the team's own notes. |
| 7 | No downloads | No download or share action anywhere on the team side. |
| 8 | Activity log | Logs file open/close (with time spent), blocked shortcuts, paste attempts, devtools shortcuts and second logins. Admin sees live counts; second logins show in red. |
| 9 | DevTools deterrent | Only the F12 and Ctrl+Shift+I/J/C shortcuts are blocked and logged. Size-based devtools detection was left out because it gives false positives on scaled Windows displays. |

## 6. Architecture

- **Next.js 14 App Router + TypeScript + Tailwind**, deployed on Vercel in region `bom1` (Mumbai), next to the Supabase project in `ap-south-1`.
- **Supabase**: Postgres for all state, with RLS on and no policies, so only the server's service role can read or write. Private storage buckets: `pages` (document images), `reports` (PDFs), `secure` (`answer_key.json` and the case backup).
- **Realtime**: after every change the server sends a Supabase Realtime *broadcast* ping on channel `nexopoly`. Pings carry no data; clients refetch from the authenticated API. Polling (team 4 s, admin 3 s, projector 2 s) is the safety net.
- **Time-driven transitions** (Vishal session expiry, auto-close of the report phase with auto-submit) run lazily inside reads (`lib/state.ts → tick()`), using conditional updates so they apply exactly once.
- **Auth**: an HS256 JWT in an httpOnly cookie (`jose`). The team cookie carries a session id that must match `teams.active_session_id`.
- **Answer key**: lives only in the private `secure` bucket. It is read by `lib/answerKey.ts` (marked server-only) for CFO answer matching, grading and the projector reveal. No team route returns any part of it; `scripts/smoke.ts` checks this.
- **Report PDF**: `pdf-lib` builds a fixed, branded layout (NEXIS logo, team, timestamp, "SUBMITTED REPORT" watermark). The JSON stored next to it is authoritative.
- **AI grading**: `lib/grading.ts` uses Claude Opus 5.5 (`claude-opus-5-5`) with structured JSON output (`output_config.format`), effort `high`, and server-side refusal fallback. Each report is graded in 2 parallel runs. The admin sees the average, the gap between runs, flags and per-issue reasons, and can accept or edit with a reason, then enters pitch marks and publishes the leaderboard.

## 7. Data model

`event_state` (single row: phase, timers, pause, toggles, injects, announcement, pitch order and timer, leaderboard flag) · `teams` · `notes` · `expert_requests` (a partial unique index allows one open request per team) · `cfo_questions` · `inbox_reads` · `reports` · `grades` · `team_scores` · `activity_log` · view `team_stats`. Full SQL: [`db/schema.sql`](../db/schema.sql).

## 8. Scoring (from the brief)

Total 100. AI grades the report out of 50: Findings 25, Quantification 10, Recommendation 15. The admin enters Vishal questions out of 30 (quality of the questions the team asked) and Pitch out of 20. Red herrings cost −5 each when called fraud. The grader prompt is in `lib/grading.ts`.
