grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "profile_owner" on public.profiles;
create policy "profile_owner" on public.profiles
    for all
    to authenticated
    using (auth_uid = (select auth.uid()))
    with check (auth_uid = (select auth.uid()));

notify pgrst, 'reload schema';
