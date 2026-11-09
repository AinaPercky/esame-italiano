-- Clarify instructions in existing draft versions of the built-in A1 and L135 exam subjects.
-- Published versions are intentionally untouched: they are immutable and may already
-- have student attempts. Editing a published exam must create a new draft version.

update public.written_exam_sections s
set instructions = case
  when s.title = 'Grammaire – Articles' then
    'Complète chaque phrase avec l’article défini ou indéfini qui convient. Écris uniquement l’article manquant et respecte le genre et le nombre du nom.'
  when s.title = 'Grammaire – Conjugaison' then
    'Conjugue chaque verbe au présent de l’indicatif. Pour les verbes pronominaux, écris aussi le pronom réfléchi. Vérifie l’accord avec le sujet.'
  when s.title = 'Grammaire – COD/COI' then
    'Remplace le complément indiqué par le pronom personnel correct : pronom direct (COD) ou indirect (COI). Écris le pronom à la place du blanc et respecte la personne, le genre et le nombre.'
  when s.title = 'Grammaire – Prépositions' then
    'Complète chaque phrase avec la préposition simple ou articulée qui convient. Repère le rapport exprimé (lieu, destination, provenance ou durée) avant de répondre.'
  when s.title = 'Grammaire – Possessifs' then
    'Complète chaque phrase avec l’adjectif possessif correspondant au possesseur. Accorde-le avec le nom possédé et ajoute l’article lorsque la construction l’exige.'
  when s.title = 'Grammaire – Essere / Avere / Stare' then
    'Choisis le verbe indiqué par le sens de la phrase (essere, avere ou stare), puis conjugue-le au présent de l’indicatif selon le sujet.'
  when s.title = 'Grammaire – Présent' then
    'Conjugue au présent de l’indicatif le verbe donné entre parenthèses. Accorde la terminaison avec le sujet de chaque phrase.'
  when s.title = 'Vocabulaire – Traduction malgache → italien' then
    'Traduis chaque mot malgache en italien. Écris un seul mot italien, sans phrase ni explication.'
  when s.title = 'Vocabulaire – QCM lexical' then
    'Pour chaque question, lis le mot ou l’indice puis sélectionne une seule réponse parmi les trois propositions.'
  when s.title = 'Vocabulaire – Antonymes' then
    'Écris en italien l’antonyme de chaque adjectif proposé. Donne un seul mot qui exprime le sens opposé.'
  when s.title = 'Vocabulaire' then
    'Lis chaque consigne et réponds en italien. Selon la question, donne une définition courte, un synonyme, une traduction ou une explication adaptée au contexte.'
  when s.title = 'Réordonnement' then
    'Reconstruis chaque phrase en utilisant tous les éléments proposés une seule fois. Place correctement le sujet, le verbe et les compléments pour obtenir une phrase italienne complète et grammaticalement correcte.'
  when s.title = 'Compléter les phrases' then
    'Complète chaque phrase avec la forme verbale correcte au présent de l’indicatif. Identifie le verbe attendu grâce au contexte, puis accorde-le avec le sujet. Écris uniquement la forme manquante.'
  when s.title = 'Compréhension écrite' then
    'Lis attentivement le texte. Pour les questions Vrai/Faux, sélectionne une seule option. Pour les réponses ouvertes, donne en italien l’information précise demandée; une formulation équivalente correcte est acceptée.'
  else s.instructions
end
from public.written_exam_versions v
where v.id = s.version_id
  and v.status = 'draft'
  and s.title in (
    'Grammaire – Articles','Grammaire – Conjugaison','Grammaire – COD/COI',
    'Grammaire – Prépositions','Grammaire – Possessifs',
    'Grammaire – Essere / Avere / Stare','Grammaire – Présent',
    'Vocabulaire – Traduction malgache → italien','Vocabulaire – QCM lexical',
    'Vocabulaire – Antonymes','Vocabulaire','Réordonnement',
    'Compléter les phrases','Compréhension écrite'
  );

update public.written_exam_questions q
set prompt = case
  when s.title = 'Grammaire – Articles' then
    'Complète le blanc avec l’article défini ou indéfini correct, en respectant le genre et le nombre du nom : ' || q.prompt
  when s.title = 'Grammaire – Conjugaison' then
    'Conjugue le verbe au présent de l’indicatif et complète la phrase. Pour un verbe pronominal, ajoute le pronom réfléchi : ' || q.prompt
  when s.title = 'Grammaire – COD/COI' then
    'Remplace le complément indiqué par le pronom direct (COD) ou indirect (COI) approprié, puis complète la phrase : ' || q.prompt
  when s.title = 'Grammaire – Prépositions' then
    'Complète le blanc avec la préposition simple ou articulée adaptée au rapport exprimé dans la phrase : ' || q.prompt
  when s.title = 'Grammaire – Possessifs' then
    'Complète avec l’adjectif possessif correspondant au possesseur. Accorde-le avec le nom et ajoute l’article si nécessaire : ' || q.prompt
  when s.title = 'Grammaire – Essere / Avere / Stare' then
    'Conjugue au présent de l’indicatif le verbe essere, avere ou stare qui convient au sens de la phrase : ' || q.prompt
  when s.title = 'Grammaire – Présent' then
    'Conjugue au présent de l’indicatif le verbe entre parenthèses en l’accordant avec le sujet : ' || q.prompt
  when s.title = 'Vocabulaire – Traduction malgache → italien' then
    'Traduis en italien le mot malgache entre guillemets. Écris un seul mot : ' || q.prompt
  when s.title = 'Vocabulaire – QCM lexical' then
    'Lis l’indice et sélectionne une seule réponse parmi les propositions : ' || q.prompt
  when s.title = 'Vocabulaire – Antonymes' then
    'Écris en italien un seul mot de sens opposé à l’adjectif proposé : ' || q.prompt
  when s.title = 'Vocabulaire' and q.prompt ilike 'Spiega %' then
    'Explique en italien, avec tes propres mots, le sens de l’expression suivante : ' || q.prompt
  when s.title = 'Vocabulaire' and q.prompt ilike 'Qual è il significato %' then
    'Écris en italien une courte définition du mot proposé : ' || q.prompt
  when s.title = 'Vocabulaire' and q.prompt ilike 'Trova un sinonimo %' then
    'Écris en italien un synonyme qui peut remplacer le mot proposé dans un contexte équivalent : ' || q.prompt
  when s.title = 'Vocabulaire' and q.prompt ilike 'Traduci %' then
    'Traduis en italien l’expression française complète : ' || q.prompt
  when s.title = 'Vocabulaire' and q.prompt ilike 'Che cosa significa %' then
    'Explique en italien le sens du verbe proposé, en une courte phrase : ' || q.prompt
  when s.title = 'Réordonnement' then
    'Réorganise tous les éléments proposés, sans en oublier ni en répéter, pour former une phrase italienne complète et grammaticalement correcte : ' || q.prompt
  when s.title = 'Compléter les phrases' then
    'Conjugue au présent de l’indicatif le verbe qui convient au contexte et accorde-le avec le sujet. Écris uniquement la forme manquante : ' || q.prompt
  when s.title = 'Compréhension écrite' and q.prompt ilike 'Dove abita %' then
    'Selon le texte, indique dans quelle ville habite Marco. Réponds en italien : ' || q.prompt
  when s.title = 'Compréhension écrite' and q.prompt ilike 'Quanti anni %' then
    'Selon le texte, indique l’âge de Marco en italien : ' || q.prompt
  when s.title = 'Compréhension écrite' and q.prompt ilike 'Che cosa studia %' then
    'Selon le texte, indique quelle matière Marco étudie. Réponds en italien : ' || q.prompt
  when s.title = 'Compréhension écrite' and q.prompt ilike 'Come va Marco %' then
    'Selon le texte, indique quel moyen de transport Marco utilise pour aller en cours. Réponds en italien : ' || q.prompt
  when s.title = 'Compréhension écrite' and q.prompt ilike 'Con chi gioca %' then
    'Selon le texte, indique avec qui Marco joue au football le week-end. Réponds en italien : ' || q.prompt
  else q.prompt
end
from public.written_exam_sections s
join public.written_exam_versions v on v.id = s.version_id
where q.section_id = s.id
  and v.status = 'draft'
  and (
    (s.title in ('Grammaire – Articles','Grammaire – Conjugaison','Grammaire – COD/COI',
      'Grammaire – Prépositions','Grammaire – Possessifs','Grammaire – Essere / Avere / Stare',
      'Grammaire – Présent','Vocabulaire – Traduction malgache → italien',
      'Vocabulaire – QCM lexical','Vocabulaire – Antonymes','Réordonnement','Compléter les phrases')
      and q.prompt not ilike 'Complète %' and q.prompt not ilike 'Conjugue %'
      and q.prompt not ilike 'Remplace %' and q.prompt not ilike 'Traduis %'
      and q.prompt not ilike 'Lis %' and q.prompt not ilike 'Écris %'
      and q.prompt not ilike 'Réorganise %')
    or (s.title = 'Vocabulaire' and q.prompt not ilike 'Explique %' and q.prompt not ilike 'Écris %' and q.prompt not ilike 'Traduis %')
    or (s.title = 'Compréhension écrite' and (
      q.prompt ilike 'Dove abita %' or q.prompt ilike 'Quanti anni %'
      or q.prompt ilike 'Che cosa studia %' or q.prompt ilike 'Come va Marco %'
      or q.prompt ilike 'Con chi gioca %'
    ) and q.prompt not ilike 'Selon le texte%')
  );

notify pgrst, 'reload schema';
