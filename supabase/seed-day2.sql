-- Fills the three empty cards with real rows. Run it in the Supabase SQL editor
-- while signed in as yourself: auth.uid() supplies the owner, so row level
-- security keeps every row yours.
--
-- Read it before you run it. The briefing reads these rows as fact, so a wrong
-- row produces a confident wrong briefing. Change any wording that is not true.

insert into public.projects (user_id, name, status) values
  (auth.uid(), 'Daniel OS',                      'active'),
  (auth.uid(), 'StewardWell Search launch',      'active'),
  (auth.uid(), 'Turnkey CFO affiliate pipeline', 'active'),
  (auth.uid(), 'Client and team retention',      'active');

insert into public.blockers (user_id, description, owner, needed_by) values
  (auth.uid(), 'Second integration still to be built from its own documentation, graded by Ricky', 'Daniel', current_date),
  (auth.uid(), 'Day 2 log has two graded sections still empty', 'Daniel', current_date),
  (auth.uid(), 'Google refresh token is not stored, so the calendar only works while signed in on the site', 'Daniel', current_date + 2);

insert into public.metrics (user_id, label, value, unit, as_of) values
  (auth.uid(), 'Sprint day',        2, 'of 14', current_date),
  (auth.uid(), 'Projects shipped',  1, null,    current_date),
  (auth.uid(), 'Systems connected', 3, null,    current_date);
