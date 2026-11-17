# Phase B — modèle d'accès aux données PerckyLingua

## Objectif

Supprimer l'accès anonyme direct aux tables scolaires sans casser :
- l'inscription publique des élèves ;
- les espaces professeur et élève ;
- le classement de classe ;
- les rapports d'examen oral par QR code ;
- les quiz publics.

## Matrice d'accès proposée

| Ressource | Anonyme | Élève authentifié | Professeur authentifié |
|---|---|---|---|
| Classes actives | Lecture | Lecture | Lecture/écriture |
| Fiche élève | Aucun accès direct | Sa propre fiche | Toutes les fiches |
| Examens | Aucun accès direct | Examens des classes actives | Tous les examens |
| Grilles d'examen | Aucun accès direct | Grilles des examens accessibles | Toutes les grilles |
| Évaluations | Aucun accès direct | Ses évaluations | Toutes les évaluations |
| Détails d'évaluation | Aucun accès direct | Détails de ses évaluations | Tous les détails |
| Ordre de passage | Aucun accès direct | Sa propre position | Ordre complet |
| Rapport oral QR | RPC ciblée | RPC ciblée | RPC ciblée ou vues privées |
| Leçons publiées | Lecture du contenu publié | Lecture du contenu publié | Gestion complète |
| Progression des leçons | Aucun accès | Sa propre progression | Lecture de toutes les progressions |
| Exercices | Aucun accès direct | Exercices attribués et RPC de tentative | Gestion complète |
| Inscription | RPC limitée | RPC limitée | Gestion complète |

## Privilèges SQL non contournables par RLS

- Tous les privilèges anonymes directs sont retirés sur les tables du schéma public.
- Seules les tables de classes actives, leçons publiées et blocs de leçons publiés conservent un SELECT anonyme.
- Les rôles clients `anon` et `authenticated` perdent `TRUNCATE`, `REFERENCES` et `TRIGGER` sur toutes les tables publiques. Ces privilèges ne sont pas filtrés par RLS ; leur retrait évite qu'un utilisateur connecté contourne les politiques de lignes.
- Les privilèges par défaut de `postgres` et `supabase_admin` sont également corrigés pour que les futures tables et fonctions ne réintroduisent pas automatiquement les droits anonymes.
- Le rôle backend `service_role` conserve ses privilèges opérationnels.

## RPC introduites

### `prepare_student_registration`

- Valide les champs de l'inscription et la classe active.
- Recherche un éventuel dossier scolaire par e-mail.
- N'associe un dossier existant que si le prénom, le nom et, lorsqu'il est fourni, le matricule correspondent.
- Crée un nouveau dossier avec le statut `pending` si aucun dossier n'existe.
- Ne retourne que les champs nécessaires à la création du compte Auth.
- N'expose jamais la liste des élèves.

### `finalize_student_registration`

- Nécessite une session Auth.
- Identifie le dossier à partir de l'e-mail du JWT, sans accepter d'identifiant élève fourni par le client.
- Place le dossier en attente de validation après une inscription ayant immédiatement créé une session.

### `get_public_oral_report`

- Reçoit un identifiant d'examen et soit l'identifiant d'un élève (QR individuel), soit son adresse e-mail (QR commun).
- Retourne uniquement le rapport correspondant à cette paire examen/élève.
- N'expose pas l'e-mail, le statut d'inscription ni les autres fiches de la classe.

### `update_own_student_profile` et `update_own_student_avatar`

- Permettent à un élève authentifié de modifier uniquement son propre prénom, nom, matricule, genre et avatar.
- L'identité est résolue depuis le JWT ; l'identifiant fourni doit correspondre à la fiche de la session.
- La classe, l'e-mail et le statut de validation ne sont jamais modifiables par ces RPC.

### `get_student_class_roster`

- Réservée aux élèves authentifiés et approuvés.
- Retourne uniquement les champs nécessaires au classement de classe : identifiant, nom, prénom, matricule, avatar et classes actives.
- N'expose pas les adresses e-mail des camarades.

## Chargement frontend

- Les visiteurs anonymes ne déclenchent plus de SELECT sur les tables scolaires privées.
- Les élèves authentifiés récupèrent leur propre fiche, les examens de leurs classes et leurs évaluations via RLS.
- Un RPC séparé fournit un répertoire minimal de camarades pour préserver le classement.
- Les progrès de leçons sont lisibles uniquement par leur propriétaire et le professeur ; l'ancienne politique de lecture globale est remplacée.
- La modification du profil élève et de sa photo passe par des RPC propriétaires, sans rétablir un droit UPDATE global sur la table `students`.
- Les modules Exercices et Quiz gardent leurs RPC existantes, mais les privilèges structurels qui contournaient RLS sont retirés.
- Les professeurs conservent le chargement complet, limité par les politiques RLS au compte enseignant.
- Le rapport QR est chargé directement par sa RPC dédiée, sans dépendre de l'état global de l'application.

## Précautions de déploiement

- Cette migration ne doit pas être appliquée directement à la base active avant réconciliation de l'historique des migrations.
- Déployer dans l'ordre : correctif de droits RPC de la PR #123, puis migration Phase B.
- La migration doit être testée sur une copie représentative avant production.
- Vérifier les comptes professeur, élève approuvé, élève en attente, QR commun, QR individuel, inscription avec confirmation e-mail activée et désactivée.
- Les tests CI utilisent un schéma PostgreSQL isolé et ne touchent pas les données de production.
