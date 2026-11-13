-- Multi-class enrollment support. Keep students.class_id as a compatibility pointer.
alter table public.classes
  add column if not exists enrollment_mode text not null default 'approval',
  add column if not exists archived_at timestamptz;
alter table public.classes drop constraint if exists classes_enrollment_mode_check;
alter table public.classes add constraint classes_enrollment_mode_check check (enrollment_mode in ('direct','approval'));
comment on column public.classes.enrollment_mode is 'Student self-enrollment mode: direct or approval.';
comment on column public.classes.archived_at is 'Soft archive timestamp; historical records are retained.';

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended','completed','abandoned','expelled')),
  source text not null default 'admin' check (source in ('admin','self_service','approved_request','legacy')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('active','suspended') and ended_at is null) or (status in ('completed','abandoned','expelled') and ended_at is not null))
);
create unique index if not exists class_enrollments_one_open_membership on public.class_enrollments(student_id,class_id) where status in ('active','suspended');
create index if not exists class_enrollments_student_status_idx on public.class_enrollments(student_id,status,started_at desc);
create index if not exists class_enrollments_class_status_idx on public.class_enrollments(class_id,status,started_at desc);

create table if not exists public.class_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists class_enrollment_one_pending_request on public.class_enrollment_requests(student_id,class_id) where status='pending';
create index if not exists class_enrollment_requests_status_date_idx on public.class_enrollment_requests(status,requested_at desc);

insert into public.class_enrollments(student_id,class_id,status,source,started_at)
select s.id,s.class_id,'active','legacy',coalesce(s.created_at,now())
from public.students s
where s.class_id is not null
and not exists (
  select 1 from public.class_enrollments ce
  where ce.student_id=s.id and ce.class_id=s.class_id and ce.status in ('active','suspended')
);

create or replace function public.class_enrollment_is_teacher()
returns boolean language sql stable security invoker set search_path=public,auth
as $$ select lower(coalesce(auth.jwt()->>'email',''))='ainapercky@gmail.com'; $$;

create or replace function public.class_enrollment_current_student_id()
returns uuid language sql stable security invoker set search_path=public,auth
as $$
  select s.id from public.students s
  where lower(s.email)=lower(coalesce(auth.jwt()->>'email',''))
    and coalesce(s.validation_status,'approved')='approved'
  order by s.created_at desc limit 1;
$$;

create or replace function public.sync_legacy_student_class_enrollment()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_changed boolean := false;
begin
  if tg_op='INSERT' then v_changed:=true;
  else v_changed:=old.class_id is distinct from new.class_id;
  end if;
  if v_changed and new.class_id is not null and not exists (
    select 1 from public.class_enrollments ce
    where ce.student_id=new.id and ce.class_id=new.class_id and ce.status in ('active','suspended')
  ) then
    insert into public.class_enrollments(student_id,class_id,status,source,started_at)
    values(new.id,new.class_id,'active','legacy',coalesce(new.created_at,now()));
  end if;
  return new;
end;
$$;
revoke all on function public.sync_legacy_student_class_enrollment() from public,anon,authenticated;
drop trigger if exists students_sync_legacy_class_enrollment on public.students;
create trigger students_sync_legacy_class_enrollment after insert or update of class_id on public.students
for each row execute function public.sync_legacy_student_class_enrollment();

create or replace function public.request_class_enrollment(p_class_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,auth
as $$
declare v_student_id uuid; v_mode text; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise.'; end if;
  v_student_id:=public.class_enrollment_current_student_id();
  if v_student_id is null then raise exception 'Aucune fiche élève approuvée ne correspond à ce compte.'; end if;
  select enrollment_mode into v_mode from public.classes where id=p_class_id and archived_at is null;
  if not found then raise exception 'Classe introuvable ou archivée.'; end if;
  if exists(select 1 from public.class_enrollments where student_id=v_student_id and class_id=p_class_id and status in ('active','suspended')) then
    raise exception 'Vous êtes déjà inscrit dans cette classe.';
  end if;
  if v_mode='direct' then
    update public.class_enrollment_requests
      set status='cancelled', updated_at=now()
      where student_id=v_student_id and class_id=p_class_id and status='pending';
    insert into public.class_enrollments(student_id,class_id,status,source) values(v_student_id,p_class_id,'active','self_service');
    return jsonb_build_object('status','active','class_id',p_class_id);
  end if;
  select id into v_request_id from public.class_enrollment_requests
  where student_id=v_student_id and class_id=p_class_id and status='pending' limit 1;
  if v_request_id is null then
    insert into public.class_enrollment_requests(student_id,class_id,status)
    values(v_student_id,p_class_id,'pending') returning id into v_request_id;
  end if;
  return jsonb_build_object('status','pending','request_id',v_request_id,'class_id',p_class_id);
end;
$$;

create or replace function public.review_class_enrollment_request(p_request_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security invoker set search_path=public,auth
as $$
declare v_request public.class_enrollment_requests%rowtype; v_enrollment_id uuid;
begin
  if auth.uid() is null or not public.class_enrollment_is_teacher() then raise exception 'Action réservée à l’administration.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Décision invalide.'; end if;
  select * into v_request from public.class_enrollment_requests where id=p_request_id for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if v_request.status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
  if p_decision='approved' then
    if exists(select 1 from public.classes where id=v_request.class_id and archived_at is not null) then
      raise exception 'Cette classe est archivée et ne peut plus recevoir d’inscription.';
    end if;
    if exists(select 1 from public.class_enrollments where student_id=v_request.student_id and class_id=v_request.class_id and status in ('active','suspended')) then
      raise exception 'Cet élève possède déjà une inscription active dans cette classe.';
    end if;
    insert into public.class_enrollments(student_id,class_id,status,source)
    values(v_request.student_id,v_request.class_id,'active','approved_request') returning id into v_enrollment_id;
  end if;
  update public.class_enrollment_requests set status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),
    review_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=p_request_id;
  return jsonb_build_object('status',p_decision,'request_id',p_request_id,'enrollment_id',v_enrollment_id);
end;
$$;

alter table public.class_enrollments enable row level security;
alter table public.class_enrollment_requests enable row level security;
drop policy if exists class_enrollments_read_own_or_teacher on public.class_enrollments;
create policy class_enrollments_read_own_or_teacher on public.class_enrollments for select to authenticated
using (public.class_enrollment_is_teacher() or student_id=public.class_enrollment_current_student_id());
drop policy if exists class_enrollments_insert_teacher_or_direct_self on public.class_enrollments;
create policy class_enrollments_insert_teacher_or_direct_self on public.class_enrollments for insert to authenticated
with check (
  public.class_enrollment_is_teacher() or (
    student_id=public.class_enrollment_current_student_id() and status='active' and source='self_service'
    and exists(select 1 from public.classes c where c.id=class_enrollments.class_id and c.enrollment_mode='direct' and c.archived_at is null)
  )
);
drop policy if exists class_enrollments_update_teacher on public.class_enrollments;
create policy class_enrollments_update_teacher on public.class_enrollments for update to authenticated
using(public.class_enrollment_is_teacher()) with check(public.class_enrollment_is_teacher());

drop policy if exists class_enrollment_requests_read_own_or_teacher on public.class_enrollment_requests;
create policy class_enrollment_requests_read_own_or_teacher on public.class_enrollment_requests for select to authenticated
using(public.class_enrollment_is_teacher() or student_id=public.class_enrollment_current_student_id());
drop policy if exists class_enrollment_requests_insert_self on public.class_enrollment_requests;
create policy class_enrollment_requests_insert_self on public.class_enrollment_requests for insert to authenticated
with check (
  student_id=public.class_enrollment_current_student_id() and status='pending'
  and exists(select 1 from public.classes c where c.id=class_enrollment_requests.class_id and c.enrollment_mode='approval' and c.archived_at is null)
);
drop policy if exists class_enrollment_requests_update_teacher on public.class_enrollment_requests;
create policy class_enrollment_requests_update_teacher on public.class_enrollment_requests for update to authenticated
using(public.class_enrollment_is_teacher()) with check(public.class_enrollment_is_teacher());
drop policy if exists class_enrollment_requests_cancel_own on public.class_enrollment_requests;
create policy class_enrollment_requests_cancel_own on public.class_enrollment_requests for update to authenticated
using(student_id=public.class_enrollment_current_student_id() and status='pending')
with check(student_id=public.class_enrollment_current_student_id() and status='cancelled');

revoke all on public.class_enrollments from anon,public;
revoke all on public.class_enrollment_requests from anon,public;
grant select,insert,update on public.class_enrollments to authenticated;
grant select,insert,update on public.class_enrollment_requests to authenticated;
revoke all on function public.class_enrollment_is_teacher() from public,anon;
revoke all on function public.class_enrollment_current_student_id() from public,anon;
revoke all on function public.request_class_enrollment(uuid) from public,anon;
revoke all on function public.review_class_enrollment_request(uuid,text,text) from public,anon;
grant execute on function public.class_enrollment_is_teacher() to authenticated;
grant execute on function public.class_enrollment_current_student_id() to authenticated;
grant execute on function public.request_class_enrollment(uuid) to authenticated;
grant execute on function public.review_class_enrollment_request(uuid,text,text) to authenticated;

-- Exercise visibility now follows every active class enrollment.
drop policy if exists exercises_student_assigned_read on public.exercises;
create policy exercises_student_assigned_read on public.exercises for select to authenticated
using (
  status='published' and exists(
    select 1 from public.exercise_class_assignments a
    join public.class_enrollments ce on ce.class_id=a.class_id
      and ce.student_id=public.exercise_current_student_id() and ce.status='active'
    where a.exercise_id=exercises.id
  )
);
drop policy if exists exercise_assignments_student_read on public.exercise_class_assignments;
create policy exercise_assignments_student_read on public.exercise_class_assignments for select to authenticated
using(exists(
  select 1 from public.class_enrollments ce
  where ce.student_id=public.exercise_current_student_id()
    and ce.class_id=exercise_class_assignments.class_id and ce.status='active'
));

-- Replace the legacy unrestricted class policy. Classes remain readable for the public
-- learning portal, but only the configured teacher can create, update, or archive them.
drop policy if exists "Classes full access" on public.classes;
drop policy if exists classes_read_available on public.classes;
create policy classes_read_available on public.classes
for select to anon, authenticated using (true);
drop policy if exists classes_teacher_manage on public.classes;
create policy classes_teacher_manage on public.classes
for all to authenticated
using (public.class_enrollment_is_teacher())
with check (public.class_enrollment_is_teacher());

-- Archiving a class closes pending requests without deleting enrollment history.
create or replace function public.cancel_pending_requests_for_archived_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $archive$
begin
  if old.archived_at is null and new.archived_at is not null then
    update public.class_enrollment_requests
    set status = 'cancelled',
        reviewed_at = now(),
        review_note = 'Classe archivée',
        updated_at = now()
    where class_id = new.id and status = 'pending';
  end if;
  return new;
end;
$archive$;
revoke all on function public.cancel_pending_requests_for_archived_class() from public, anon, authenticated;
drop trigger if exists classes_cancel_pending_enrollment_requests on public.classes;
create trigger classes_cancel_pending_enrollment_requests
after update of archived_at on public.classes
for each row execute function public.cancel_pending_requests_for_archived_class();
