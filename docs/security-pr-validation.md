# Validation pre-fusion — sécurité Phase A et Phase B

## Portée

Cette validation prépare la fusion de la PR #123 (droits RPC SECURITY DEFINER) puis de la PR #124 (RLS et RPC scolaires). Elle ne fusionne aucune PR et n'applique aucune migration à un projet Supabase hébergé.

## Ordre validé en CI

1. Le workflow utilise le bootstrap PostgreSQL isolé de la Phase B.
2. Il installe des fonctions factices représentatives des RPC publiques quiz, inscription et rapport QR, ainsi que le helper privé de notation et une fonction trigger.
3. Il applique la migration Phase A 20261117180000_restrict_anonymous_security_definer_rpcs.sql.
4. Il exécute les tests de grants Phase A.
5. Il applique la migration Phase B 20261121000000_secure_school_data_rls_and_public_report.sql.
6. Il exécute les tests RLS Phase B puis les assertions cumulatives : cinq RPC publiques exactes, absence de droits hérités de PUBLIC, helper privé inaccessible aux rôles client, service_role préservé et trigger toujours actif.

Le workflow récupère la branche fix/phase-b-rls-data-access à son état courant. Il doit être relancé après chaque modification de cette branche ; le résultat est associé au SHA testé.

## RPC publiques préservées par Phase A

Les signatures explicitement autorisées sont :
- get_public_quiz_catalog()
- get_public_quiz(text)
- evaluate_public_quiz_question(text,text,text)
- prepare_student_registration(text,text,text,text,uuid,text)
- get_public_oral_report(uuid,uuid,text)

Les fonctions d'inscription et de rapport QR sont autorisées par signature exacte, pas par nom seul. Les migrations Phase B recréent ensuite leurs définitions et accordent explicitement les droits requis.

## Privilèges par défaut

La Phase B retire le privilège EXECUTE global par défaut de PUBLIC, puis retire les privilèges par défaut anon et authenticated au niveau du seul schéma public pour les fonctions créées par postgres et supabase_admin. Cette portée évite de modifier les defaults d'autres schémas. Les RPC nécessaires doivent recevoir des grants explicites. Les tests créent des fonctions probes sous les deux propriétaires et vérifient les deux rôles client.

## Limite de confidentialité QR identifiée

Les QR individuels actuels portent exam et l'UUID étudiant dans l'URL ; le lien agit donc comme un secret porteur. Le QR commun permet une recherche par e-mail, qui ne constitue pas une preuve d'identité. La RPC limite la réponse à un rapport unique et omet l'e-mail, mais ne rend pas l'accès privé.

Le comportement est conservé pour compatibilité avec les QR déjà distribués. Avant production si les résultats sont confidentiels, une évolution dédiée doit remplacer ces mécanismes par des jetons aléatoires opaques, hachés en base, révocables/renouvelables, associés à un seul rapport, avec limitation de débit et tests anti-énumération. Cette évolution n'est pas incluse dans les migrations A/B présentes.

## Critères de sortie

- CI cumulative verte sur les derniers SHA des deux branches.
- CI propres des PR #123 et #124 vertes.
- Revue manuelle de la confidentialité QR et décision explicite du responsable produit.
- Historique des migrations local/distant réconcilié avant toute production.
- Tests sur une copie Supabase représentative avant déploiement.
- Fusion et déploiement soumis à autorisation explicite distincte.
