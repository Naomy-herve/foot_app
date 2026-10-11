-- Données de démonstration facultatives. À exécuter une seule fois sur une base neuve.
insert into public.stadiums(name,city,capacity)
select 'Stade du Port','Marseille',42000 where not exists (select 1 from public.stadiums where name='Stade du Port');
insert into public.stadiums(name,city,capacity)
select 'Parc Nord','Lille',38000 where not exists (select 1 from public.stadiums where name='Parc Nord');
insert into public.stadiums(name,city,capacity)
select 'Arena Rouge','Lyon',55000 where not exists (select 1 from public.stadiums where name='Arena Rouge');
insert into public.stadiums(name,city,capacity)
select 'Stade des Alpes','Grenoble',30000 where not exists (select 1 from public.stadiums where name='Stade des Alpes');
insert into public.referees(name,country)
select 'M. Lefèvre','France' where not exists (select 1 from public.referees where name='M. Lefèvre');
insert into public.referees(name,country)
select 'A. Okafor','Nigeria' where not exists (select 1 from public.referees where name='A. Okafor');
insert into public.referees(name,country)
select 'S. Duarte','Portugal' where not exists (select 1 from public.referees where name='S. Duarte');
insert into public.teams(name,city,coach,stadium_id)
select 'Olympique Port','Marseille','R. Vidal',id from public.stadiums where name='Stade du Port'
and not exists (select 1 from public.teams where name='Olympique Port');
insert into public.teams(name,city,coach,stadium_id)
select 'Lille Nord FC','Lille','C. Moreau',id from public.stadiums where name='Parc Nord'
and not exists (select 1 from public.teams where name='Lille Nord FC');
insert into public.teams(name,city,coach,stadium_id)
select 'Lyon Rouge','Lyon','P. Bertin',id from public.stadiums where name='Arena Rouge'
and not exists (select 1 from public.teams where name='Lyon Rouge');
insert into public.teams(name,city,coach,stadium_id)
select 'Alpes United','Grenoble','J. Faure',id from public.stadiums where name='Stade des Alpes'
and not exists (select 1 from public.teams where name='Alpes United');
insert into public.notifications(text)
select 'Bienvenue dans le championnat. Les résultats se mettent à jour automatiquement.'
where not exists (select 1 from public.notifications where text like 'Bienvenue dans le championnat.%');

insert into public.players(name,team_id,pos,number)
select (array['Diallo','Marchand','Kone','Rivière'])[g.n] || ' ' || t.id::text,
       t.id,
       (array['GK','DEF','MID','ATT'])[g.n],
       g.n + 8
from public.teams t cross join generate_series(1,4) as g(n)
where not exists (select 1 from public.players p where p.team_id = t.id);

insert into public.matches(home_id,away_id,date,stadium_id,referee_id,hg,ag,played)
select home.id, away.id,
       current_date + (row_number() over (order by home.id, away.id) - 1)::integer,
       home.stadium_id,
       (select min(r.id) from public.referees r),
       0, 0, false
from public.teams home
join public.teams away on away.id <> home.id
where not exists (
  select 1 from public.matches m where m.home_id = home.id and m.away_id = away.id
);
