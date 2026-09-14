-- Ejecutar una sola vez en Supabase: SQL Editor > New query.
-- Guarda el perfil y el progreso de cada cuenta en la nube.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  scores jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Los usuarios autenticados solo pueden modificar su progreso, nunca su rol.
grant usage on schema public to authenticated;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (scores, rewards, updated_at) on table public.profiles to authenticated;

drop policy if exists "Profiles: users can read their own" on public.profiles;
create policy "Profiles: users can read their own"
  on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "Profiles: users can update their own" on public.profiles;
create policy "Profiles: users can update their own"
  on public.profiles for update to authenticated using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do update set name = excluded.name, email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Después de registrar la cuenta administradora, ejecutá esta línea una vez:
-- update public.profiles set role = 'admin' where email = 'admin@cyberquest.com';
