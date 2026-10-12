-- Several laptops per team: one row per signed-in device.
create table if not exists team_sessions (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  member text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists team_sessions_team on team_sessions(team_id, created_at);
alter table team_sessions enable row level security;

alter table event_state add column if not exists devices_per_team int not null default 3;
alter table notes add column if not exists author text;
