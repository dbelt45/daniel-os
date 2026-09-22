-- Fills the three empty cards with real rows. Paste it into the Supabase SQL
-- editor and Run.
--
-- The SQL editor runs as the database owner, not as you, so auth.uid() is empty
-- there. Instead every row is stamped with the one account that has signed in
-- to Daniel OS, which is you. Row level security then keeps every row yours.
--
-- Read it before you run it. The briefing reads these rows as fact, so a wrong
-- row produces a confident wrong briefing. Change any wording that is not true.

do $$
declare me uuid;
begin
  select id into me from auth.users order by created_at limit 1;
  if me is null then raise exception 'Sign in to Daniel OS once before running this.'; end if;

  insert into public.projects (user_id, name, status) values
    (me, 'Daniel OS',                      'active'),
    (me, 'StewardWell Search launch',      'active'),
    (me, 'Turnkey CFO affiliate pipeline', 'active'),
    (me, 'Client and team retention',      'active');

  insert into public.blockers (user_id, description, owner, needed_by) values
    (me, 'Second integration still to be built from its own documentation, graded by Ricky', 'Daniel', current_date),
    (me, 'Day 2 log has two graded sections still empty', 'Daniel', current_date),
    (me, 'Google refresh token is not stored, so the calendar only works while signed in on the site', 'Daniel', current_date + 2);

  insert into public.metrics (user_id, label, value, unit, as_of) values
    (me, 'Sprint day',        4, 'of 14', current_date),
    (me, 'Projects shipped',  1, null,    current_date),
    (me, 'Systems connected', 4, null,    current_date);
end $$;
