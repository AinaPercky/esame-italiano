import React, { useMemo, useState } from 'react';
import { Copy, Sparkles, Languages, FileText } from 'lucide-react';

type Props = { lessonJson: string; onCopy: (value: string, successMessage: string) => void };

const SUBJECTS: Record<string, string> = {
  grammaire: 'Grammaire italienne',
  vocabulaire: 'Vocabulaire italien',
  fonction: 'Fonctions communicatives en italien',
  theme: 'Thème / culture italienne',
  prononciation: 'Prononciation italienne'
};

export const MindMapPromptGenerator: React.FC<Props> = ({ lessonJson, onCopy }) => {
  const [language, setLanguage] = useState('Italien (termes et exemples italiens, explications françaises)');
  const parsed = useMemo(() => {
    try {
      const lesson = JSON.parse(lessonJson);
      return lesson && typeof lesson === 'object' ? lesson : null;
    } catch {
      return null;
    }
  }, [lessonJson]);

  const prompt = useMemo(() => {
    if (!parsed) return '';
    const title = [parsed.title_it, parsed.title_fr].filter(Boolean).join(' / ') || parsed.slug || 'Cours sans titre';
    const level = parsed.level || 'Non précisé';
    const subject = SUBJECTS[parsed.type] || parsed.type || 'Cours d’italien';
    const courseContent = JSON.stringify({
      titre_italien: parsed.title_it || null,
      titre_francais: parsed.title_fr || null,
      objectif_pedagogique: parsed.objective || null,
      blocs_du_cours: Array.isArray(parsed.blocks) ? parsed.blocks : []
    }, null, 2);

    return `# PROMPT MAÎTRE — PERCKYLINGUA MIND MAP

Tu es un expert en pédagogie, en sciences cognitives et en cartographie mentale. Tu maîtrises les principes de la méthode de Tony Buzan.

Ta mission : transformer le cours fourni en une véritable carte mentale pédagogique, visuelle, structurée et facile à mémoriser.

## PARAMÈTRES DU COURS
Titre : ${title}
Niveau : ${level}
Matière : ${subject}
Langue de la carte : ${language}

## 1. OBJECTIF PÉDAGOGIQUE — UN VRAI RÉSUMÉ DU COURS
- La carte mentale doit être une synthèse fidèle et structurée de la leçon complète, pas une reproduction de son plan ni une seconde fiche de cours.
- Sélectionne uniquement les notions indispensables à comprendre et mémoriser : concepts, règles, mécanismes, distinctions, exemples courts et exceptions utiles.
- Condense les explications longues en mots-clés et formulations très courtes, sans perdre leur sens.
- Ne crée **aucune branche ou section intitulée « À retenir », « À retenir absolument », « L’essentiel », « Résumé », « Conclusion » ou équivalent**. Les éléments importants doivent être intégrés directement dans les branches thématiques auxquelles ils appartiennent.
- N’ajoute pas de bloc final récapitulatif qui répète les branches déjà présentes.
- N’invente aucune règle ni information ; adapte la sélection et le vocabulaire au niveau ${level}.
- La carte doit permettre de retrouver rapidement l'architecture et les idées essentielles de la leçon en un seul regard.

## 2. STRUCTURE HIÉRARCHIQUE — INSPIRATION TONY BUZAN
- Structure radiale partant du centre, avec une illustration centrale forte représentant le thème.
- Crée des branches principales correspondant aux grands thèmes ou notions distinctes du cours (généralement 3 à 7, selon le contenu).
- **Privilégie les sous-branches et sous-sous-branches dès qu'elles clarifient la hiérarchie** : répartis les détails sous la bonne notion au lieu de multiplier les branches principales.
- Organise chaque branche selon une logique claire : notion → règle ou caractéristique → cas particuliers / exemple bref.
- Une idée doit apparaître une seule fois, à l'endroit hiérarchique le plus pertinent. Si elle concerne plusieurs notions, indique un lien ou une flèche entre les branches plutôt que de la recopier.
- Utilise des mots-clés et expressions courtes ; évite les phrases longues, les paragraphes et les répétitions.
- Les branches sont organiques, courbes et connectées ; les branches secondaires sont plus fines et les niveaux de ramification doivent être visuellement distincts.
- Utilise associations visuelles, symboles, pictogrammes, mini-dessins et flèches pour expliquer les relations sans dupliquer le texte.
- Évite les tableaux, les listes rigides et les encadrés d’infographie classique.

## 3. IDENTITÉ GRAPHIQUE PERMANENTE — PERCKYLINGUA
Toutes les cartes doivent conserver la même signature visuelle, quelle que soit la leçon.

Palette de marque et accents :
- Bleu profond : #072A3F
- Bleu secondaire : #0B3C5D
- Vert pédagogique : #2FA36B
- Vert italien : #009246
- Rouge italien : #CE2B37
- Orange vif : #F28C28
- Jaune lumineux : #F4C542
- Violet : #805AD5
- Turquoise : #20A4A8
- Corail : #E85D75
- Fond blanc pur obligatoire : #FFFFFF

Style :
- Dessin manuel soigné, inspiré des cartes mentales de Tony Buzan.
- Fond entièrement blanc pur (#FFFFFF), uniforme, sans texture, sans papier crème, sans ombre, sans dégradé et sans cadre coloré.
- Aspect naturel, vivant, organique, moderne et légèrement ludique, jamais enfantin.
- Branches principales épaisses, très colorées et distinctes ; branches secondaires fines, colorées et fluides.
- Illustrations nombreuses et pédagogiques : un dessin central détaillé et au moins une petite illustration par branche principale, plus des pictogrammes ou mini-dessins sur les ramifications importantes.
- Utilise des métaphores visuelles, personnages, objets, flèches, bulles, étoiles, symboles et petites scènes pour rendre les notions mémorables.
- Dessins colorés à la main, expressifs, précis et variés ; ne remplace pas les illustrations par de simples emojis.
- Composition riche et vivante mais aérée : remplir harmonieusement l’espace blanc, éviter les grandes zones vides et préserver la lisibilité.
- Conserver la même identité graphique PerckyLingua entre toutes les leçons.

## 4. CODE COULEUR
Attribue une couleur vive et distincte à chaque branche principale, sans réutiliser la même couleur pour deux branches voisines. Utilise la palette PerckyLingua (bleu, vert, rouge) complétée par orange, jaune, violet, turquoise et corail. Garde une logique stable : bleu pour concepts, vert pour règles, rouge pour exceptions et erreurs, orange/jaune pour exemples, violet/turquoise pour relations et comparaisons. Répète la couleur de la branche sur ses ramifications, mots-clés et illustrations afin de renforcer les associations visuelles. Les couleurs doivent être franches, lumineuses et harmonieuses, jamais ternes.

## 5. CONTENU, DÉDOUBLONNAGE ET FIDÉLITÉ
- Rédige les libellés dans la langue choisie pour la carte et respecte exactement les termes grammaticaux, scientifiques ou techniques.
- Avant de dessiner, analyse l'ensemble du cours et regroupe les informations qui parlent de la même notion.
- **Chaque notion, règle, définition, exemple ou information ne doit figurer qu'une seule fois dans toute la carte.** Supprime les doublons même si la même idée apparaît dans plusieurs blocs du cours.
- Ne reformule pas une même information sur une autre branche ; choisis son emplacement le plus logique et crée éventuellement une flèche de renvoi.
- N'inscris pas les mêmes exemples à plusieurs endroits. Garde seulement l'exemple le plus clair et le plus représentatif.
- Ne transforme pas les titres de blocs pédagogiques (« À retenir », récapitulatif, rappel, bilan, etc.) en branches. Récupère uniquement les informations nouvelles et utiles qu'ils contiennent, puis intègre-les dans les branches existantes sans répétition.
- Mets les exceptions en évidence dans la sous-branche de la règle concernée.
- Écarte les consignes d'activité, questions d'exercice, répétitions, introductions longues et détails secondaires qui n'aident pas à comprendre la leçon.
- N’ajoute aucun contenu extérieur présenté comme faisant partie du cours ; ne supprime aucune distinction essentielle.

## 6. FORMAT DE SORTIE — OBLIGATOIRE
- **Page A4 en orientation paysage (horizontal), dimensions exactes : 297 × 210 mm, ratio 1,414:1.**
- Produis une seule image horizontale adaptée à une impression A4 paysage ; n'utilise jamais le format portrait, carré ou vertical.
- Fais occuper à la carte mentale toute la surface utile de la page : exploite pleinement la largeur et la hauteur, avec une composition équilibrée d'un bord à l'autre.
- Répartis les branches principales sur toute la largeur du format paysage, à gauche et à droite du centre ; utilise également l'espace supérieur et inférieur.
- Évite les grandes zones blanches inutilisées et les éléments regroupés uniquement au centre ; la carte doit remplir visuellement la page sans être surchargée.
- Garde une marge de sécurité discrète d'environ 5 mm pour éviter que les textes et illustrations soient coupés à l'impression ; aucun élément important ne doit toucher le bord.
- Fond blanc pur #FFFFFF obligatoire sur toute la surface de l’image.
- Couleurs franches, lumineuses et contrastées, avec de nombreuses illustrations dessinées.
- Tous les éléments doivent rester dans les limites de l’image, sans rognage ni déformation.
- Textes lisibles à l’écran et après impression au format A4 paysage.
- Pas de signature, filigrane, titre parasite ou décoration sans intérêt pédagogique.

## 7. RÉSULTAT ATTENDU
Produis une véritable carte mentale radiale, et non une infographie, une fiche de cours ou une simple liste.
Elle doit être immédiatement reconnaissable comme une carte mentale PerckyLingua. Le style graphique reste constant entre les leçons ; seule l’organisation du contenu s’adapte au sujet.
Vérifie la fidélité du contenu et l’orthographe avant de finaliser.

## CONTENU INTÉGRAL DU COURS
Les données ci-dessous constituent la source de vérité. Exploite les informations pédagogiques pertinentes sans inventer les éléments absents.

${courseContent}
`;
  }, [parsed, language]);

  return (
    <section className="mt-4 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="rounded-lg bg-[#072a3f] p-2 text-white"><Sparkles size={17} /></span>
          <div>
            <h3 className="text-sm font-bold text-[#072a3f]">Générateur de prompt — Mind map</h3>
            <p className="mt-1 text-xs text-slate-600">Les paramètres et le contenu sont extraits automatiquement de la leçon.</p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">PerckyLingua · Tony Buzan</span>
      </div>
      {!parsed ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Le JSON de la leçon est invalide. Corrigez-le pour générer le prompt.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5"><p className="text-[10px] font-semibold uppercase text-slate-500">Titre</p><p className="mt-1 text-xs font-bold text-slate-800">{[parsed.title_it, parsed.title_fr].filter(Boolean).join(' / ') || parsed.slug || 'Non renseigné'}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5"><p className="text-[10px] font-semibold uppercase text-slate-500">Niveau</p><p className="mt-1 text-xs font-bold text-slate-800">{parsed.level || 'Non renseigné'}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5"><p className="text-[10px] font-semibold uppercase text-slate-500">Matière</p><p className="mt-1 text-xs font-bold text-slate-800">{SUBJECTS[parsed.type] || parsed.type || 'Non renseignée'}</p></div>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-700">
            <span className="mb-1.5 flex items-center gap-1.5"><Languages size={14} /> Langue de la carte</span>
            <select value={language} onChange={event => setLanguage(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2fa36b]">
              <option>Italien (termes et exemples italiens, explications françaises)</option>
              <option>Italien uniquement</option><option>Français uniquement</option><option>Bilingue italien / français</option>
            </select>
          </label>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><FileText size={14} /> Prompt complet généré</span><span className="text-[10px] text-slate-500">{Array.isArray(parsed.blocks) ? parsed.blocks.length : 0} blocs intégrés</span></div>
            <textarea readOnly value={prompt} className="max-h-72 min-h-48 w-full resize-y bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700 focus:outline-none" />
          </div>
          <button type="button" onClick={() => onCopy(prompt, 'Prompt complet du mind map copié dans le presse-papiers.')} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d]"><Copy size={15} /> Copier le prompt complet</button>
        </>
      )}
    </section>
  );
};
