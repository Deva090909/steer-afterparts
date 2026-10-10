-- Applied to Supabase project rgruynyujkakdbzbcwtw (steer-afterparts) on 2026-10-10.
create table public.app_users (
  email text primary key check (email = lower(email)),
  role text not null default 'member' check (role in ('member','admin')),
  added_at timestamptz not null default now()
);
create or replace function public.is_app_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users u where u.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users u where u.email = lower(coalesce(auth.jwt() ->> 'email', '')) and u.role = 'admin');
$$;
revoke execute on function public.is_app_user() from public, anon;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
alter table public.app_users enable row level security;
create policy "members read team list" on public.app_users for select to authenticated using (public.is_app_user());
create policy "admins add people" on public.app_users for insert to authenticated with check (public.is_app_admin());
create policy "admins change people" on public.app_users for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "admins remove people" on public.app_users for delete to authenticated using (public.is_app_admin());

create table public.docs (
  path text primary key check (char_length(path) between 3 and 300 and position('/' in path) > 1),
  collection text generated always as (split_part(path, '/', 1)) stored,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index docs_collection_idx on public.docs (collection);
create or replace function public.docs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger docs_touch before insert or update on public.docs for each row execute function public.docs_touch();
alter table public.docs enable row level security;
create policy "members read" on public.docs for select to authenticated using (public.is_app_user());
create policy "members insert" on public.docs for insert to authenticated with check (public.is_app_user());
create policy "members update" on public.docs for update to authenticated using (public.is_app_user()) with check (public.is_app_user());
create policy "members delete" on public.docs for delete to authenticated using (public.is_app_user());
alter publication supabase_realtime add table public.docs;

insert into storage.buckets (id, name, public, file_size_limit) values ('attachments', 'attachments', true, 20971520) on conflict (id) do nothing;
create policy "members upload attachments" on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and public.is_app_user());
create policy "members delete attachments" on storage.objects for delete to authenticated using (bucket_id = 'attachments' and public.is_app_user());

-- First administrator (change to your own email when reusing this file)
insert into public.app_users (email, role) values ('amitsdevrukhkar@gmail.com', 'admin');
