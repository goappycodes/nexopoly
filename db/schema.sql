-- Nexopoly schema. Every table is reached only through the server (service role).
-- RLS is on with no policies, so the public anon key can read nothing.

create extension if not exists pgcrypto;

create table if not exists event_state (
  id int primary key default 1 check (id = 1),
  phase text not null default 'lobby',
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  paused boolean not null default false,
  paused_remaining_ms bigint,
  vishal_sessions_per_team int not null default 2,
  queue_open boolean not null default false,
  cfo_open boolean not null default false,
  inject1_at timestamptz,
  inject2_at timestamptz,
  inject2_deadline timestamptz,
  announcement text,
  announcement_at timestamptz,
  focus_threshold int not null default 10,
  pitch_order uuid[] not null default '{}',
  pitch_index int not null default 0,
  pitch_ends_at timestamptz,
  pitch_paused_remaining_ms bigint,
  leaderboard_published boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into event_state (id) values (1) on conflict do nothing;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  code text unique not null,
  table_no text,
  members text[] not null default '{}',
  vishal_used int not null default 0,
  vishal_extra int not null default 0,
  cfo_used int not null default 0,
  active_session_id uuid,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  doc_id text not null,
  page_no int not null default 1,
  x real,
  y real,
  text text not null default '',
  tag text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_team on notes(team_id);

create table if not exists expert_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  question text not null,
  doc_ids text[] not null default '{}',
  status text not null default 'waiting', -- waiting | in_session | done | skipped | cancelled
  position double precision not null,
  skip_count int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  expert_note text
);
-- One open request per team, enforced by the database.
create unique index if not exists expert_one_open on expert_requests(team_id)
  where status in ('waiting', 'in_session');

create table if not exists cfo_questions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  question text not null,
  matched_topic text,
  answer text not null,
  overridden_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists inbox_reads (
  team_id uuid not null references teams(id) on delete cascade,
  inject_no int not null,
  read_at timestamptz not null default now(),
  primary key (team_id, inject_no)
);

create table if not exists reports (
  team_id uuid primary key references teams(id) on delete cascade,
  data jsonb not null default '{}',
  status text not null default 'not_started', -- not_started | drafting | submitted
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  pdf_path text,
  updated_at timestamptz not null default now()
);

create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  run_no int not null,
  json_result jsonb,
  total numeric,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists team_scores (
  team_id uuid primary key references teams(id) on delete cascade,
  ai_total numeric,
  variance numeric,
  needs_review boolean not null default false,
  accepted boolean not null default false,
  final_ai numeric,
  edit_reason text,
  pitch_marks numeric,
  updated_at timestamptz not null default now()
);

create table if not exists activity_log (
  id bigserial primary key,
  team_id uuid references teams(id) on delete cascade,
  event_type text not null,
  doc_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_team on activity_log(team_id, created_at);

alter table event_state enable row level security;
alter table teams enable row level security;
alter table notes enable row level security;
alter table expert_requests enable row level security;
alter table cfo_questions enable row level security;
alter table inbox_reads enable row level security;
alter table reports enable row level security;
alter table grades enable row level security;
alter table team_scores enable row level security;
alter table activity_log enable row level security;

-- Private storage buckets: page images, report PDFs, and the answer key.
insert into storage.buckets (id, name, public) values ('pages', 'pages', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('reports', 'reports', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('secure', 'secure', false) on conflict (id) do nothing;
create or replace view team_stats with (security_invoker = true) as
select t.id as team_id,
  (select count(*) from notes n where n.team_id = t.id) as notes,
  (select count(distinct a.doc_id) from activity_log a where a.team_id = t.id and a.event_type = 'file_open') as files_opened,
  (select count(*) from activity_log a where a.team_id = t.id and a.event_type = 'focus_loss') as focus_losses,
  (select count(*) from activity_log a where a.team_id = t.id and a.event_type in ('blocked_shortcut','paste_blocked','context_menu','print_attempt','devtools')) as blocked,
  (select count(*) from activity_log a where a.team_id = t.id and a.event_type = 'second_login') as second_logins
from teams t;
revoke all on team_stats from anon, authenticated;
