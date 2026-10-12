-- PropertyOS owner cloud storage. Run once in the Supabase SQL Editor.
-- Public API keys identify the app; auth.uid() and these policies authorize each owner.
begin;
create table if not exists public.propertyos_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  envelope jsonb not null check (
    envelope->>'format' = 'PropertyOS' and envelope->>'version' = '1'
    and (envelope->>'revision')::bigint = revision
    and jsonb_typeof(envelope->'ciphertext') = 'string'
    and jsonb_typeof(envelope->'salt') = 'string'
    and jsonb_typeof(envelope->'iv') = 'string'
    and jsonb_typeof(envelope->'vaultId') = 'string'
  ),
  updated_at timestamptz not null default now()
);
create table if not exists public.propertyos_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_key text not null,
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, snapshot_key)
);
alter table public.propertyos_vaults enable row level security;
alter table public.propertyos_snapshots enable row level security;
drop policy if exists propertyos_vault_read on public.propertyos_vaults;
create policy propertyos_vault_read on public.propertyos_vaults for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists propertyos_snapshot_read on public.propertyos_snapshots;
create policy propertyos_snapshot_read on public.propertyos_snapshots for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.propertyos_vaults, public.propertyos_snapshots from anon, authenticated;
grant select on public.propertyos_vaults, public.propertyos_snapshots to authenticated;

create or replace function public.propertyos_save(p_envelope jsonb, p_expected bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  old_envelope jsonb;
  old_revision bigint;
  new_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_envelope is null or p_envelope->>'format' is distinct from 'PropertyOS'
     or p_envelope->>'version' is distinct from '1'
     or jsonb_typeof(p_envelope->'ciphertext') is distinct from 'string'
     or jsonb_typeof(p_envelope->'salt') is distinct from 'string'
     or jsonb_typeof(p_envelope->'iv') is distinct from 'string'
     or jsonb_typeof(p_envelope->'vaultId') is distinct from 'string'
  then raise exception 'Invalid encrypted workspace'; end if;
  if octet_length(p_envelope::text) > 67108864 then raise exception 'Cloud workspace exceeds 64 MB. Export attachments and reduce size.'; end if;
  new_revision := (p_envelope->>'revision')::bigint;
  if new_revision is null or new_revision < 1 then raise exception 'Invalid revision'; end if;
  -- Also serializes the first insert when no row exists yet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select revision, envelope into old_revision, old_envelope from public.propertyos_vaults where user_id = owner_id for update;
  if old_revision is distinct from p_expected then raise exception 'Workspace changed: revision conflict'; end if;
  if p_expected is not null and new_revision <> p_expected + 1 then raise exception 'Invalid next revision'; end if;
  if old_envelope is not null then
    insert into public.propertyos_snapshots(user_id,snapshot_key,envelope) values(owner_id,'recovery',old_envelope)
      on conflict(user_id,snapshot_key) do update set envelope=excluded.envelope,created_at=now();
  end if;
  insert into public.propertyos_vaults(user_id,revision,envelope) values(owner_id,new_revision,p_envelope)
    on conflict(user_id) do update set revision=excluded.revision,envelope=excluded.envelope,updated_at=now();
  return new_revision;
end;
$$;

create or replace function public.propertyos_checkpoint(p_key text, p_envelope jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_envelope jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_key is null or (p_key <> 'pre-restore' and p_key !~ '^daily:[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid snapshot key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select envelope into current_envelope from public.propertyos_vaults where user_id=owner_id for update;
  if current_envelope is distinct from p_envelope then raise exception 'Workspace changed before backup. Reopen the latest revision.'; end if;
  if p_key = 'pre-restore' then
    insert into public.propertyos_snapshots(user_id,snapshot_key,envelope) values(owner_id,p_key,current_envelope)
      on conflict(user_id,snapshot_key) do update set envelope=excluded.envelope,created_at=now();
  else
    insert into public.propertyos_snapshots(user_id,snapshot_key,envelope) values(owner_id,p_key,current_envelope) on conflict do nothing;
    delete from public.propertyos_snapshots where user_id=owner_id and snapshot_key like 'daily:%'
      and snapshot_key not in (select snapshot_key from public.propertyos_snapshots where user_id=owner_id and snapshot_key like 'daily:%' order by snapshot_key desc limit 14);
  end if;
end;
$$;
revoke all on function public.propertyos_save(jsonb,bigint), public.propertyos_checkpoint(text,jsonb) from public, anon;
grant execute on function public.propertyos_save(jsonb,bigint), public.propertyos_checkpoint(text,jsonb) to authenticated;
commit;
