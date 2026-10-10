-- Prototype mode: the workspace opens without sign-in (role switcher only).
-- Drop these policies to require sign-in again (and set open:false in config.js).
create policy "prototype open read" on public.docs for select to anon using (true);
create policy "prototype open insert" on public.docs for insert to anon with check (true);
create policy "prototype open update" on public.docs for update to anon using (true) with check (true);
create policy "prototype open delete" on public.docs for delete to anon using (true);
create policy "prototype open upload" on storage.objects for insert to anon with check (bucket_id = 'attachments');
