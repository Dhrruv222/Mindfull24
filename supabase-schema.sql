-- Run in Supabase: SQL Editor > New query
create table if not exists profiles (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 60),
  age int not null check (age between 5 and 120),
  bio text default '' check (char_length(bio) <= 200),
  created_at timestamptz default now()
);

create table if not exists door_progress (
  profile_id uuid references profiles(id) on delete cascade,
  day int not null check (day between 1 and 24),
  status text not null check (status in ('unopened','opened','completed')),
  note text default '' check (char_length(note) <= 500),
  updated_at timestamptz default now(),
  primary key (profile_id, day)
);

create table if not exists reviews (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id) on delete set null,
  name text not null,
  age int,
  verdict text not null,
  rating int not null check (rating between 1 and 5),
  notes text not null check (char_length(notes) <= 2000),
  completed_count int default 0,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table door_progress enable row level security;
alter table reviews enable row level security;

-- No login in this prototype: anonymous visitors may read/add/update, but never delete.
create policy "profiles read"   on profiles for select using (true);
create policy "profiles insert" on profiles for insert with check (true);
create policy "profiles update" on profiles for update using (true) with check (true);

create policy "progress read"   on door_progress for select using (true);
create policy "progress insert" on door_progress for insert with check (true);
create policy "progress update" on door_progress for update using (true) with check (true);

create policy "reviews read"    on reviews for select using (true);
create policy "reviews insert"  on reviews for insert with check (true);
