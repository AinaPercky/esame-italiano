-- Keep the built-in draft exam instructions short and neutral.
-- Published exam versions remain untouched to preserve existing student attempts.

update public.written_exam_sections s
set instructions = case
  when s.title = 'Grammaire – Prépositions' then 'Completa con la preposizione corretta.'
  when s.title = 'Grammaire – Articles' then 'Completa con l’articolo corretto.'
  when s.title in ('Grammaire – Conjugaison','Grammaire – Présent','Grammaire – Essere / Avere / Stare','Compléter les phrases') then 'Completa con la forma verbale corretta.'
  when s.title = 'Grammaire – COD/COI' then 'Completa con il pronome corretto.'
  when s.title = 'Grammaire – Possessifs' then 'Completa con il possessivo corretto.'
  when s.title = 'Réordonnement' then 'Riordina gli elementi.'
  else s.instructions
end
from public.written_exam_versions v
where v.id = s.version_id
  and v.status = 'draft'
  and s.title in (
    'Grammaire – Prépositions','Grammaire – Articles','Grammaire – Conjugaison',
    'Grammaire – Présent','Grammaire – Essere / Avere / Stare',
    'Compléter les phrases','Grammaire – COD/COI','Grammaire – Possessifs',
    'Réordonnement'
  );

update public.written_exam_questions q
set prompt = case
  when s.title = 'Grammaire – Prépositions' then
    'Completa con la preposizione corretta: ' || btrim(regexp_replace(q.prompt, '^.*: *', ''))
  when s.title = 'Grammaire – Articles' then
    'Completa con l’articolo corretto: ' || btrim(regexp_replace(q.prompt, '^.*: *', ''))
  when s.title in ('Grammaire – Conjugaison','Grammaire – Présent','Grammaire – Essere / Avere / Stare','Compléter les phrases') then
    'Completa con la forma corretta: ' || btrim(regexp_replace(q.prompt, '^.*: *', ''))
  when s.title = 'Grammaire – COD/COI' then
    'Completa con il pronome corretto: ' || btrim(regexp_replace(q.prompt, '^.*: *', ''))
  when s.title = 'Grammaire – Possessifs' then
    'Completa con il possessivo corretto: ' || btrim(regexp_replace(q.prompt, '^.*: *', ''))
  when s.title = 'Réordonnement' then
    'Riordina gli elementi: ' || btrim(regexp_replace(q.prompt, '^.*: *', ''))
  else q.prompt
end
from public.written_exam_sections s
join public.written_exam_versions v on v.id = s.version_id
where q.section_id = s.id
  and v.status = 'draft'
  and s.title in (
    'Grammaire – Prépositions','Grammaire – Articles','Grammaire – Conjugaison',
    'Grammaire – Présent','Grammaire – Essere / Avere / Stare',
    'Compléter les phrases','Grammaire – COD/COI','Grammaire – Possessifs',
    'Réordonnement'
  );

notify pgrst, 'reload schema';
