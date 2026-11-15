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

## 1. OBJECTIF PÉDAGOGIQUE
- Identifie le thème central et les idées essentielles du cours.
- Organise les informations sous forme de branches hiérarchisées.
- Fais ressortir les relations entre les notions.
- Privilégie les mots-clés et expressions courtes plutôt que les paragraphes.
- Préserve les règles, définitions, exemples et exceptions réellement présents dans le cours.
- N’invente aucune règle ni information.
- Adapte la densité et le vocabulaire au niveau ${level}.
- La carte doit permettre de réviser le cours en un seul regard.

## 2. STRUCTURE — INSPIRATION TONY BUZAN
- Structure radiale partant du centre.
- Illustration centrale forte représentant le thème.
- Entre 3 et 7 branches principales selon la richesse du contenu.
- Branches organiques, courbes et connectées.
- Branches secondaires plus fines, avec un mot-clé ou une courte expression.
- Utilise des associations visuelles, symboles, pictogrammes, mini-dessins et flèches.
- Montre les liens entre notions lorsqu’ils facilitent la compréhension.
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

## 5. CONTENU ET FIDÉLITÉ
- Rédige les libellés dans la langue choisie pour la carte.
- Respecte exactement les termes grammaticaux, scientifiques ou techniques.
- Conserve les exemples utiles et les distinctions importantes.
- Mets les exceptions en évidence.
- Évite les répétitions et les détails secondaires.
- Ne surcharge pas la carte : sélectionne les idées essentielles si le cours est dense.
- N’ajoute aucun contenu extérieur présenté comme faisant partie du cours.

## 6. FORMAT DE SORTIE
- Format A4 paysage, haute résolution.
- Fond blanc pur #FFFFFF obligatoire sur toute la surface de l’image.
- Couleurs franches, lumineuses et contrastées, avec de nombreuses illustrations dessinées.
- Tous les éléments doivent rester dans les limites de l’image.
- Textes lisibles à l’écran et après impression.
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
