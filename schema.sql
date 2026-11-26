-- Run this whole file once in Supabase: SQL Editor > New query > Run

-- One profile per sign-up
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text
);

-- A row (owner -> viewer) means the owner's location is visible to the viewer.
-- Connecting two people creates two rows, so the sharing is mutual.
create table shares (
  owner_id uuid references profiles(id) on delete cascade,
  viewer_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (owner_id, viewer_id)
);

-- Latest known position per user
create table locations (
  user_id uuid primary key references profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  is_sharing boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Create a profile automatically when someone signs up
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, lower(new.email), split_part(new.email, '@', 1));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Connect with someone by email (creates both directions)
create or replace function connect_with(target_email text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from profiles where email = lower(target_email);
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  insert into shares (owner_id, viewer_id)
  values (auth.uid(), target), (target, auth.uid())
  on conflict do nothing;
  return 'ok';
end; $$;

-- Remove a connection in both directions
create or replace function disconnect_from(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from shares
  where (owner_id = auth.uid() and viewer_id = other)
     or (owner_id = other and viewer_id = auth.uid());
$$;

-- Row-level security
alter table profiles enable row level security;
alter table shares enable row level security;
alter table locations enable row level security;

create policy "signed-in users can read profiles" on profiles
  for select to authenticated using (true);

create policy "users update own profile" on profiles
  for update to authenticated using (auth.uid() = id);

create policy "owners manage their shares" on shares
  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "viewers can see who shares with them" on shares
  for select to authenticated using (auth.uid() = viewer_id);

create policy "users write only their own location" on locations
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own location, or sharing locations of connections" on locations
  for select to authenticated using (
    user_id = auth.uid()
    or (is_sharing and exists (
      select 1 from shares s
      where s.owner_id = locations.user_id and s.viewer_id = auth.uid()
    ))
  );

-- Push location changes to the app in real time
alter publication supabase_realtime add table locations;
