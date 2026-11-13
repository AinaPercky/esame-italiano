-- Minimal application schema for isolated PostgreSQL CI tests.
-- This is not a production schema and must never be applied to the live project.
create role anon nologin;
create role authenticated nologin;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

grant usage on schema auth to authenticated;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$;

grant execute on function auth.jwt() to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  student_number text,
  validation_status text not null default 'approved'
);
