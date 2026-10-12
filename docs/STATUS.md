# Nexopoly: what's built and how to run it

Last updated: 12 October 2026 (night before the event). Plan and decisions: [PLAN.md](PLAN.md).

## Built

| Area | State | Where |
|---|---|---|
| Team sign-in (name + code, table, members; second device ends the first) | Done, smoke-tested | `app/page.tsx`, `app/api/auth/team` |
| Google Drive-style workspace: folder tree, list/grid, type filters, search, owners, dates | Done | `components/team/Drive.tsx`, `TeamApp.tsx` |
| Document viewer: canvas pages, zoom 50–200%, page navigation, live watermark, focus blur | Done | `components/team/Viewer.tsx` |
| Server watermark burned into every page, 60-second signed image URLs | Done, smoke-tested | `app/api/team/page`, `app/api/img`, `lib/images.tsx` |
| Copy, print, shortcut, right-click and drag blocking; focus-loss logging | Done | `components/team/lockdown.ts` |
| Pinned notes (numbered markers), notes panel, All notes view with folder/tag filters, tags, Proven/Needs verification, Promote to finding | Done | `components/team/Notes.tsx` |
| Report builder: fixed 9-section form, word limits, Doc ID pickers, restated PBT calculator, paste blocked, 10-second autosave, findings-only during the audit, submit-once | Done, smoke-tested | `components/team/Report.tsx`, `app/api/team/report` |
| Auto-submit at the end of the report phase; PDF and JSON stored | Done, smoke-tested | `lib/reports.ts`, `lib/state.ts` |
| Ask Vishal: question gate, one open request (enforced by the database), cancel, position and wait, live 2-minute countdown, Time up | Done, smoke-tested | `components/team/Vishal.tsx`, `app/api/team/vishal` |
| Accounts desk (2 CFO questions, scripted answers from the answer key, admin overwrite) | Done | `components/team/Desk.tsx`, `app/api/team/cfo` |
| Injects: Inject 1 pre-rendered; Inject 2 rendered live with the real deadline; Inbox banner and chime | Done, smoke-tested | `lib/images.tsx` (`renderInject2`) |
| Projector: phase countdown, timeline, Vishal queue with current session and Time up, announcements, inject flash, pitch timer (red at 15 s), reveal, leaderboard with top 3 | Done | `app/display/page.tsx` |
| Admin console: run of show with confirms, pause/resume/+5, queue and desk toggles, announcements, pitch control, live teams with red flags and activity log, queue control, desk overrides, grading, setup, login cards, reset, exports | Done | `app/admin/page.tsx`, `app/admin/cards`, `app/api/admin/*` |
| AI grading (Claude Opus 5.5, 2 runs, gap flag, injection flag, accept/edit with a reason, pitch marks, leaderboard) | Built; needs `ANTHROPIC_API_KEY` | `lib/grading.ts` |
| Exports: report PDFs zip, report JSON, scores CSV, activity CSV | Done | `app/api/admin/export` |
| Case content: 22 documents, validation, answer key, CFO answer bank | See the "Case content" section below | `case/` (local only) |

`scripts/smoke.ts` covers the full event flow through the API: logins, second-device kick, phases, pause/extend, signed images, queue rules, projector privacy, notes, phase-gated report saving, submit, auto-submit, Drive lock, PDF, exports, and checks that no route leaks the answer key. It passes against the local dev server.

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
ANTHROPIC_API_KEY=           # for AI grading
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

- Teams: `/`
- Admin: `/admin` (login cards at `/admin/cards`)
- Projector: `/display`

## Event-day checklist

1. Admin → Setup: create the teams, choose 1 or 2 Vishal sessions per team, print the login cards.
2. Open `/display` on the projector, full screen (F11), and sign in with the display PIN.
3. Admin → Setup → Reset event after any dry run.
4. Run the event from Admin → Event control, top to bottom.
5. After close: Grading → Grade all → review flagged reports and the top 3 → enter pitch marks → Publish leaderboard → Show results.
6. Exports: download the PDFs zip and the scores CSV.

## Known limits

- Screenshots and phone cameras can't be blocked by a browser. The watermark makes leaked images traceable.
- DevTools detection is limited to the keyboard shortcuts (deterrent only).
- Grader: Opus 5.5 rejects `temperature`, so consistency relies on two runs and the review flag.
