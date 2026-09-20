-- Fills the three empty cards with real rows. Run it in the Supabase SQL editor
-- while signed in as yourself: auth.uid() supplies the owner, so row level
-- security keeps every row yours.
--
-- Edit the text to match your actual week before running it. These are starting
-- rows, not decoration, and the briefing reads them as fact.

insert into public.projects (user_id, name, status) values
  (auth.uid(), 'Daniel OS',                     'active'),
  (auth.uid(), 'StewardWell Search launch',     'active'),
  (auth.uid(), 'Turnkey CFO affiliate pipeline','active'),
  (auth.uid(), 'Client and team retention',     'active');

insert into public.blockers (user_id, description, owner, needed_by) values
  (auth.uid(), 'Anthropic API key needed before the briefing and chat can run', 'Daniel', current_date),
  (auth.uid(), 'GitHub token needs adding to Vercel so the Code card works in production', 'Daniel', current_date);

insert into public.metrics (user_id, label, value, unit, as_of) values
  (auth.uid(), 'Sprint day',        2,  'of 14', current_date),
  (auth.uid(), 'Projects shipped',  1,  null,    current_date),
  (auth.uid(), 'Systems connected', 3,  null,    current_date);
