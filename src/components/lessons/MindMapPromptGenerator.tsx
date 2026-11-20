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

const normalizeSectionName = (value: unknown): string =>
  typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[’']/g, '')
    : '';

const isExcludedMindMapBlock = (value: Record<string, any>): boolean => {
  const type = normalizeSectionName(value.type || value.kind);
  if (type === 'dialogue' || type === 'recap') return true;

  const headings = [value.title, value.label, value.heading, value.subtitle]
    .map(normalizeSectionName)
    .filter(Boolean);

  return headings.some(heading =>
    /^(dialogue|a retenir|points a retenir|recap|recapitulatif)$/.test(heading)
  );
};

// Exclut ces deux sections même lorsqu'elles sont imbriquées dans un module.
function filterMindMapSource(value: any): any {
  if (Array.isArray(value)) {
    return value
      .filter(item => !(item && typeof item === 'object' && !Array.isArray(item) && isExcludedMindMapBlock(item)))
      .map(filterMindMapSource);
  }
  if (!value || typeof value !== 'object') return value;

  const filtered: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeSectionName(key).replace(/[^a-z0-9]+/g, '_');
    if (['dialogue', 'recap', 'a_retenir', 'points_a_retenir'].includes(normalizedKey)) continue;
    filtered[key] = filterMindMapSource(child);
  }
  return filtered;
}

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
    const subject = SUBJECTS[parsed.type] || parsed.type || 'Cours d’italien';
    // Conserve le JSON du cours, en excluant uniquement le dialogue et « À retenir ».
    const lessonForMindMap = filterMindMapSource(parsed);
    const courseContent = JSON.stringify(lessonForMindMap, null, 2);

    const generatedPrompt = `# CARTE MENTALE PÉDAGOGIQUE — PERCKYLINGUA

Crée une véritable carte mentale pour le cours « ${title} ».

**Informations du cours**
- Niveau : ${parsed.level || 'non précisé'}
- Matière : ${subject}
- Langue : ${language}

**Ta mission**
Tu es spécialiste de pédagogie, de mémorisation visuelle et de cartographie mentale. Transforme le cours fourni en une synthèse visuelle claire, fidèle et facile à mémoriser. La carte doit montrer les liens entre les notions et permettre de retrouver rapidement l'organisation de la leçon. Ce n'est ni une fiche de cours, ni une infographie composée de blocs indépendants.

**Organisation — méthode de Tony Buzan**
- Place au centre une illustration forte qui représente le sujet, accompagnée du titre court.
- Fais partir du centre 3 à 7 branches principales, selon la richesse réelle du cours. Chaque branche représente une grande notion, pas un paragraphe ou une étape arbitraire.
- Développe des sous-branches et, si nécessaire, des niveaux supplémentaires : notion → règle ou caractéristique → exemple, exception ou cas particulier.
- Répartis les branches autour du centre, avec une composition équilibrée à gauche et à droite.
- Utilise des branches organiques, courbes et connectées. Les branches principales sont plus épaisses ; les ramifications deviennent progressivement plus fines.
- Privilégie les mots-clés, expressions courtes, formules et exemples très brefs. Évite les phrases longues, les paragraphes, les tableaux et les listes rigides.
- Utilise des flèches, associations et petits symboles dessinés pour montrer les relations entre notions lorsque cela apporte une vraie information.

**Qualité pédagogique et fidélité**
- Analyse tout le contenu avant de construire la carte. Regroupe les informations qui traitent de la même notion et place chacune à l'endroit le plus logique.
- Chaque règle, définition ou exemple ne doit apparaître qu'une seule fois. Supprime les répétitions, y compris celles qui proviennent du récapitulatif.
- Conserve les distinctions importantes, les formes grammaticales, les mécanismes et les exceptions utiles. Place chaque exception près de la règle concernée.
- Choisis des exemples courts et représentatifs, sans recopier plusieurs fois le même exemple.
- Pour une leçon d'italien, respecte exactement l'orthographe, les accents et les formes italiennes. Selon la langue choisie, garde les termes et exemples italiens avec leurs explications françaises, ou applique strictement la langue sélectionnée.
- Adapte la densité au niveau ${parsed.level || 'du cours'} : ne simplifie pas au point de supprimer une notion nécessaire, mais écarte les détails secondaires.
- N'invente aucune règle, traduction, exception ou information absente du cours. Si une information est ambiguë, ne la complète pas par supposition.
- N'ajoute pas de branche intitulée « À retenir », « L'essentiel », « Résumé » ou « Conclusion ». Ne crée pas de bloc final qui répète les branches.

**Identité graphique constante — PerckyLingua**
Adopte le style d'un manuel scolaire illustré des années 1960, chaleureux et pédagogique, inspiré de l'esprit de la méthode Boscher sans reproduire ses planches, personnages ou compositions. Les dessins doivent être simples, expressifs, légèrement naïfs et immédiatement compréhensibles : personnages, objets du quotidien, animaux ou petites scènes concrètes. Utilise des contours dessinés à l'encre et des aplats évoquant la gouache ou les crayons de couleur imprimés. Chaque illustration doit aider à comprendre ou mémoriser une notion ; évite la décoration gratuite.

Utilise une couleur distincte pour chaque branche principale, puis conserve cette couleur sur ses ramifications, mots-clés et illustrations. Palette PerckyLingua : bleu profond #072A3F, bleu secondaire #0B3C5D, vert #2FA36B, vert italien #009246, rouge italien #CE2B37, complétés par orange, jaune, violet et turquoise. Les couleurs doivent être franches, harmonieuses et suffisamment contrastées. Le fond doit rester blanc pur #FFFFFF, uniforme.

À éviter : rendu 3D, photoréalisme, effets glossy ou métalliques, style futuriste, manga, cliparts génériques, emojis à la place des dessins, ombres réalistes, dégradés, textures de papier ou fond crème. La typographie doit être nette, sobre et parfaitement lisible ; une touche manuscrite scolaire est possible pour les mots-clés.

**Mise en page et impression**
- Produis une seule image au format A4 paysage : 297 × 210 mm, ratio 1,414:1. N'utilise ni format carré ni portrait.
- Exploite la largeur et la hauteur de la page. Répartis les branches autour du centre et évite les grands espaces vides ou une carte trop tassée au milieu.
- Garde une marge de sécurité d'environ 5 mm. Aucun texte, dessin ou branche important ne doit être coupé ou toucher le bord.
- Assure une hiérarchie visuelle évidente et une taille de texte lisible à l'écran comme après impression.
- N'ajoute ni filigrane, ni signature, ni titre décoratif, ni élément sans intérêt pédagogique.

Avant de finaliser, vérifie que la carte est bien radiale, que les branches sont hiérarchisées, que les informations essentielles sont présentes une seule fois et que tous les textes sont correctement orthographiés.

**CONTENU DU COURS — SOURCE À RESPECTER**
Le JSON ci-dessous contient le contenu pédagogique du cours et constitue la seule source à respecter. Le dialogue et la section « À retenir » ont été volontairement exclus. Exploite les autres blocs : règles, explications, définitions, vocabulaire, tableaux, exemples, étapes, formules, exceptions, conseils et avertissements. Organise-les en branches cohérentes sans inventer d'informations.

${courseContent}`;

    return generatedPrompt;
  }, [parsed, language]);

  return (
    <section className="mt-4 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="rounded-lg bg-[#072a3f] p-2 text-white"><Sparkles size={17} /></span>
          <div>
            <h3 className="text-sm font-bold text-[#072a3f]">Générateur de prompt — Mind map</h3>
            <p className="mt-1 text-xs text-slate-600">Un prompt détaillé avec le contenu du cours au format JSON, sans dialogue ni récapitulatif.</p>
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
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><FileText size={14} /> Prompt détaillé généré</span><span className="text-[10px] text-slate-500">{prompt.length.toLocaleString("fr-FR")} caractères · {Array.isArray(parsed.blocks) ? parsed.blocks.length : 0} blocs</span></div>
            <textarea readOnly value={prompt} className="max-h-72 min-h-48 w-full resize-y bg-white p-3 font-sans text-[11px] leading-relaxed text-slate-700 focus:outline-none" />
          </div>
          <button type="button" onClick={() => onCopy(prompt, 'Prompt du mind map copié dans le presse-papiers.')} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d]"><Copy size={15} /> Copier le prompt complet</button>
        </>
      )}
    </section>
  );
};
