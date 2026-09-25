-- Ruzzle 24h : classement entre amis.
-- A coller dans Supabase > SQL Editor > New query, puis "Run".
--
-- Principe : les tables sont fermees (RLS active, aucune policy).
-- L'app ne passe que par les fonctions ci-dessous, qui verifient le code secret du joueur.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  secret text unique not null,
  friend_code text unique not null,
  name text not null check (char_length(name) between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists scores (
  player_id uuid not null references players(id) on delete cascade,
  day date not null,
  score int not null default 0,
  words int not null default 0,
  total int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, day)
);

create table if not exists friendships (
  requester uuid not null references players(id) on delete cascade,
  addressee uuid not null references players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

alter table players enable row level security;
alter table scores enable row level security;
alter table friendships enable row level security;
revoke all on players, scores, friendships from anon, authenticated;

-- ---------- Outils internes ----------

create or replace function r24_me(p_secret text) returns players
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  select * into me from players where secret = upper(replace(p_secret, ' ', ''));
  if me.id is null then raise exception 'unknown_player'; end if;
  return me;
end $$;

create or replace function r24_are_friends(a uuid, b uuid) returns boolean
language sql security definer set search_path = public as $$
  select a = b or exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

create or replace function r24_code(len int) returns text
language sql as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, len);
$$;

-- ---------- Profil ----------

create or replace function create_player(p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare p players;
begin
  loop
    begin
      insert into players (secret, friend_code, name)
      values (
        -- 48 bits aleatoires issus d'un UUID v4 (generateur cryptographique)
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
        r24_code(6),
        trim(p_name)
      )
      returning * into p;
      exit;
    exception when unique_violation then
      -- collision de code : on retente
    end;
  end loop;
  return json_build_object('id', p.id, 'name', p.name, 'secret', p.secret, 'friend_code', p.friend_code);
end $$;

create or replace function restore_player(p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare me players := r24_me(p_secret);
begin
  return json_build_object('id', me.id, 'name', me.name, 'secret', me.secret, 'friend_code', me.friend_code);
end $$;

create or replace function rename_player(p_secret text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare me players := r24_me(p_secret);
begin
  update players set name = trim(p_name) where id = me.id;
end $$;

-- ---------- Scores ----------

create or replace function submit_score(p_secret text, p_day date, p_score int, p_words int, p_total int)
returns void
language plpgsql security definer set search_path = public as $$
declare me players := r24_me(p_secret);
begin
  if p_day > current_date + 1 or p_day < current_date - 400 then raise exception 'bad_day'; end if;
  insert into scores (player_id, day, score, words, total)
  values (me.id, p_day, greatest(p_score, 0), greatest(p_words, 0), greatest(p_total, 0))
  on conflict (player_id, day) do update set
    score = greatest(scores.score, excluded.score),
    words = greatest(scores.words, excluded.words),
    total = excluded.total,
    updated_at = now();
end $$;

-- ---------- Amis ----------

-- Retourne : sent | accepted | already | pending | self | not_found
create or replace function request_friend(p_secret text, p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me players := r24_me(p_secret);
  other players;
  f friendships;
begin
  select * into other from players where friend_code = upper(trim(p_code));
  if other.id is null then return 'not_found'; end if;
  if other.id = me.id then return 'self'; end if;

  select * into f from friendships
  where (requester = me.id and addressee = other.id) or (requester = other.id and addressee = me.id);

  if f.requester is null then
    insert into friendships (requester, addressee) values (me.id, other.id);
    return 'sent';
  elsif f.status = 'accepted' then
    return 'already';
  elsif f.requester = other.id then
    -- L'autre m'avait deja demande : on accepte directement
    update friendships set status = 'accepted' where requester = other.id and addressee = me.id;
    return 'accepted';
  else
    return 'pending';
  end if;
end $$;

create or replace function respond_friend(p_secret text, p_player uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me players := r24_me(p_secret);
begin
  if p_accept then
    update friendships set status = 'accepted'
    where requester = p_player and addressee = me.id and status = 'pending';
  else
    delete from friendships where requester = p_player and addressee = me.id and status = 'pending';
  end if;
end $$;

create or replace function remove_friend(p_secret text, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players := r24_me(p_secret);
begin
  delete from friendships
  where (requester = me.id and addressee = p_player) or (requester = p_player and addressee = me.id);
end $$;

-- ---------- Lecture ----------

-- Classement du jour (moi + amis), demandes recues et envoyees
create or replace function get_social(p_secret text, p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare me players := r24_me(p_secret);
begin
  return json_build_object(
    'me', json_build_object('id', me.id, 'name', me.name, 'friend_code', me.friend_code),
    'board', coalesce((
      select json_agg(row_to_json(t) order by t.score desc, t.words desc, t.name)
      from (
        select p.id, p.name, coalesce(s.score, 0) as score, coalesce(s.words, 0) as words, s.total
        from players p
        left join scores s on s.player_id = p.id and s.day = p_day
        where r24_are_friends(me.id, p.id)
      ) t
    ), '[]'::json),
    'incoming', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name) order by f.created_at)
      from friendships f join players p on p.id = f.requester
      where f.addressee = me.id and f.status = 'pending'
    ), '[]'::json),
    'outgoing', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name) order by f.created_at)
      from friendships f join players p on p.id = f.addressee
      where f.requester = me.id and f.status = 'pending'
    ), '[]'::json)
  );
end $$;

-- Profil d'un joueur (soi-meme ou un ami accepte)
create or replace function get_profile(p_secret text, p_player uuid, p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare
  me players := r24_me(p_secret);
  target players;
begin
  if not r24_are_friends(me.id, p_player) then raise exception 'not_friends'; end if;
  select * into target from players where id = p_player;
  return json_build_object(
    'id', target.id,
    'name', target.name,
    'is_me', target.id = me.id,
    'today', (
      select json_build_object('score', score, 'words', words, 'total', total)
      from scores where player_id = target.id and day = p_day
    ),
    'week', coalesce((
      select json_agg(json_build_object('day', day, 'score', score, 'words', words, 'total', total) order by day)
      from scores where player_id = target.id and day > p_day - 7 and day <= p_day
    ), '[]'::json),
    'all_time', (
      select json_build_object(
        'score', coalesce(sum(score), 0),
        'words', coalesce(sum(words), 0),
        'days', count(*) filter (where words > 0),
        'best', coalesce(max(score), 0),
        'complete', count(*) filter (where total > 0 and words >= total)
      )
      from scores where player_id = target.id
    )
  );
end $$;

-- Seules les fonctions publiques sont appelables depuis l'app
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  create_player(text), restore_player(text), rename_player(text, text),
  submit_score(text, date, int, int, int),
  request_friend(text, text), respond_friend(text, uuid, boolean), remove_friend(text, uuid),
  get_social(text, date), get_profile(text, uuid, date)
to anon, authenticated;
