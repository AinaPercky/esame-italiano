-- Make the detailed student copy available for existing published results.
-- The student-facing UI and get_my_written_exam_corrections() both gate access
-- on the version flag. Older versions defaulted this flag to false, which hid
-- the download button even when the score had already been published.
alter table public.written_exams
  alter column show_corrections_after_publish set default true;

alter table public.written_exam_versions
  alter column show_corrections_after_publish set default true;

-- Existing submitted attempts keep their original version. Enable detailed
-- corrections on those exact versions; do not create a new version or alter
-- student answers, grades, publication status, or attempt order.
update public.written_exam_versions v
set show_corrections_after_publish = true
where v.show_corrections_after_publish = false
  and exists (
    select 1
    from public.written_exam_attempts a
    where a.version_id = v.id
      and a.results_published = true
  );

-- Keep the parent exam flag aligned for list views and older clients.
update public.written_exams e
set show_corrections_after_publish = true
where e.show_corrections_after_publish = false
  and exists (
    select 1
    from public.written_exam_attempts a
    where a.exam_id = e.id
      and a.results_published = true
  );

notify pgrst, 'reload schema';
