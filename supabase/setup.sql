-- Ad Free Sudoku: global leaderboard. Paste into Supabase > SQL Editor > New query, then Run. Safe to run again.
-- Players can read only the public columns. They cannot write to the table directly: the game calls two
-- functions, one to add or update their own entry and one to delete it. The private id is never readable.
create table if not exists public.sudoku_players (
  id          text primary key check (char_length(id) between 8 and 64),
  pid         text not null check (char_length(pid) between 1 and 8),
  name        text not null check (char_length(name) between 1 and 24),
  rating      int  not null check (rating between 0 and 5000),
  games       int  not null check (games between 0 and 100000),
  wins        int  not null check (wins between 0 and games),
  best_score  int  not null check (best_score between 0 and 100000),
  updated_at  timestamptz not null default now()
);
alter table public.sudoku_players enable row level security;
drop policy if exists "anyone can read the board" on public.sudoku_players;
create policy "anyone can read the board" on public.sudoku_players for select to anon using (true);
revoke all on public.sudoku_players from anon, authenticated;
grant select (pid, name, rating, games, wins, best_score, updated_at) on public.sudoku_players to anon;

create or replace function public.sudoku_submit(p_id text, p_pid text, p_name text, p_rating int, p_games int, p_wins int, p_best int)
returns void language sql security definer set search_path = public as $$
  insert into sudoku_players (id, pid, name, rating, games, wins, best_score, updated_at)
  values (p_id, p_pid, left(p_name, 24), p_rating, p_games, p_wins, p_best, now())
  on conflict (id) do update set pid = excluded.pid, name = excluded.name, rating = excluded.rating, games = excluded.games,
    wins = excluded.wins, best_score = excluded.best_score, updated_at = now();
$$;
create or replace function public.sudoku_leave(p_id text)
returns void language sql security definer set search_path = public as $$
  delete from sudoku_players where id = p_id;
$$;
revoke all on function public.sudoku_submit(text, text, text, int, int, int, int) from public;
revoke all on function public.sudoku_leave(text) from public;
grant execute on function public.sudoku_submit(text, text, text, int, int, int, int) to anon;
grant execute on function public.sudoku_leave(text) to anon;
