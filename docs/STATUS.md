# Nexopoly: what's built and how to run it

Last updated: 12 October 2026 (night before the event). Plan and decisions: [PLAN.md](PLAN.md).

## Built

| Area | State | Where |
|---|---|---|
| Multi-laptop teams: each member signs in with their own name (limit set in Admin → Setup, default 3; the oldest laptop is signed out past it and logged); notes shared live with author labels; one shared report saved as field-level patches and merged on the server; teammates online shown in the top bar | Done, tested (`scripts/multi-device-test.ts`) | `team_sessions` table, `lib/session.ts`, `components/team/useSharedReport.ts`, `lib/reports.ts` (`applyReportPatch`) |
| Team sign-in (name + code, table, members; second device ends the first) | Done, smoke-tested | `app/page.tsx`, `app/api/auth/team` |
| Google Drive-style workspace: folder tree, list/grid, type filters, search, owners, dates | Done | `components/team/Drive.tsx`, `TeamApp.tsx` |
| Document viewer: canvas pages, zoom 50–200%, page navigation, live watermark | Done | `components/team/Viewer.tsx` |
| Server watermark burned into every page, 60-second signed image URLs | Done, smoke-tested | `app/api/team/page`, `app/api/img`, `lib/images.tsx` |
| Copy, print, shortcut, right-click and drag blocking | Done | `components/team/lockdown.ts` |
| Pinned notes (numbered markers), notes panel, All notes view with folder/tag filters, tags, Proven/Needs verification, Promote to finding | Done | `components/team/Notes.tsx` |
| Report builder: fixed 4-section form (team, summary, findings, cash), word limits, Doc ID pickers, paste blocked, 10-second autosave, findings-only during the audit, submit-once | Done, smoke-tested | `components/team/Report.tsx`, `app/api/team/report` |
| Auto-submit at the end of the report phase; PDF and JSON stored | Done, smoke-tested | `lib/reports.ts`, `lib/state.ts` |
| Ask Vishal: question gate, one open request (enforced by the database), cancel, position and wait, live 2-minute countdown, Time up | Done, smoke-tested | `components/team/Vishal.tsx`, `app/api/team/vishal` |
| Inject 1 (pre-rendered whistleblower email); Inbox banner and chime. Inject 2 was removed on 12 Oct | Done, smoke-tested | `app/api/team/state` |
| Projector: phase countdown, timeline, Vishal queue with current session and Time up, announcements, inject flash, pitch timer (red at 15 s), reveal, leaderboard with top 3 | Done | `app/display/page.tsx` |
| Admin console: run of show with confirms, pause/resume/+5, queue and desk toggles, announcements, pitch control, live teams with red flags and activity log, queue control, desk overrides, grading, setup, login cards, reset, exports | Done | `app/admin/page.tsx`, `app/admin/cards`, `app/api/admin/*` |
| AI grading via OpenRouter (Claude Sonnet 5.5 by default, `GRADER_MODEL` to change; 2 runs, gap flag, injection flag, accept/edit with a reason, Vishal and pitch marks, leaderboard) | Built; tested against OpenRouter on 12 Oct (one run ~8 s, injection flagged) | `lib/grading.ts` |
| Exports: report PDFs zip, report JSON, scores CSV, activity CSV | Done | `app/api/admin/export` |
| Case content: 22 documents (36 pages) plus Inject 1, 828 validation checks passing, answer key | Done, uploaded to private storage | `case/` (local only, backed up privately) |

`scripts/smoke.ts` covers the full event flow through the API: logins, second-device kick, phases, pause/extend, signed images, queue rules, projector privacy, notes, phase-gated report saving, submit, auto-submit, Drive lock, PDF, exports, and checks that no route leaks the answer key. It passes against production (https://nexopoly.vercel.app) with the real documents.

**Load test (production, 12 Oct):** 15 teams signed in at once within 0.6 s; then 60 s of polling and page opens, 392 requests, 0 errors, median 298 ms, 95th percentile 1.06 s (one cold start at 9.8 s). Run it with `npx tsx scripts/load.ts https://nexopoly.vercel.app 15 60` while the event is in the audit phase, then reset.

**Realtime:** broadcast pings reach clients in about 300 ms; polling is the backup.

**Grading check:** the grader was run once against OpenRouter on a synthetic report (12 Oct): it matched a finding with evidence, scored cash leakage, and flagged an "ignore your instructions" line as injection. Grade one dry-run report from the admin console before the event to confirm the full path on Vercel.

**RM-01 (Read me) updated 12 Oct:** no invest decision; deliverables are executive summary, findings, and cash leakage with adjusted operating cash flow; scoring 30 / 20 / 30 / 20 (findings, cash, expert meeting, pitch); one 2-minute expert meeting requested in the app; each member may use their own laptop; no Accounts Manager. Source is `case/templates/organiser.ts`; re-render with `npx tsx case/render.ts RM-01` and upload the two pages to `pages/RM-01/`.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

`.env.local` (never committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=        # only for scripts/migrate.ts
SUPABASE_PROJECT_REF=
SESSION_SECRET=              # long random string
ADMIN_PASSWORD=
DISPLAY_PIN=
FACULTY_PASSWORD=            # for /faculty
OPENROUTER_API_KEY=          # for AI grading
GRADER_MODEL=                # optional, default anthropic/claude-sonnet-5.5
```

Database: `npx tsx scripts/migrate.ts` applies `db/schema.sql` (idempotent).

Smoke test (changes event state; `--reset` clears it first):

```bash
npx tsx scripts/smoke.ts http://localhost:3000 --reset
```

## Case content (private)

The case folder is gitignored because this repo is public. To work on it from another machine:

```bash
npx tsx scripts/case-backup.ts pull    # restores case/ from private Supabase storage
```

Pipeline: see `case/README.md`. After regenerating, run `npm run case:upload` (pages and answer key go to private storage; `manifest.json` and `public.json` go to `data/`), commit `data/`, redeploy, then `npx tsx scripts/case-backup.ts push`.

## URLs

- Production: https://nexopoly.vercel.app (Vercel project `nexopoly`, team appycodes-demo, region bom1)

- Teams: `/`
- Admin: `/admin` (login cards at `/admin/cards`)
- Projector: `/display`
- Faculty review: `/faculty` (password `FACULTY_PASSWORD`; admins can open it too). The same Drive view and document viewer the teams get, with every folder and the Inbox open, plus one **All anomalies** page: restated numbers, every planted issue with its evidence Doc IDs (click to open) and the red herrings. Read-only.

## Event-day checklist

1. Admin → Setup → Reset event after any dry run. This deletes the teams too, so do it before creating the real teams.
2. Admin → Setup: create the teams (each gets 1 Vishal session; add more per team from Live teams if needed), print the login cards.
3. Open `/display` on the projector, full screen (F11), and sign in with the display PIN.
4. Run the event from Admin → Event control, top to bottom.
5. After close: Grading → Grade all → review flagged reports and the top 3 → enter Vishal marks (/30) and pitch marks (/20) → Publish leaderboard → Show results.
6. Exports: download the PDFs zip and the scores CSV.

## Known limits

- Screenshots and phone cameras can't be blocked by a browser. The watermark makes leaked images traceable.
- DevTools detection is limited to the keyboard shortcuts (deterrent only).
- Grader: Opus 5.5 rejects `temperature`, so consistency relies on two runs and the review flag.
