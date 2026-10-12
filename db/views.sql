create or replace view team_stats with (security_invoker = true) as
select t.id as team_id,
  (select count(*) from notes n where n.team_id = t.id) as notes,
  (select count(distinct a.doc_id) from activity_log a where a.team_id = t.id and a.event_type = 'file_open') as files_opened,
  (select count(*) from activity_log a where a.team_id = t.id and a.event_type = 'focus_loss') as focus_losses,
  (select count(*) from activity_log a where a.team_id = t.id and a.event_type in ('blocked_shortcut','paste_blocked','context_menu','print_attempt','devtools')) as blocked,
  (select count(*) from activity_log a where a.team_id = t.id and a.event_type = 'second_login') as second_logins
from teams t;
revoke all on team_stats from anon, authenticated;
