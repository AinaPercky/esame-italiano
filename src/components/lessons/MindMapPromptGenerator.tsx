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

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/==|\+\+/g, '').trim() : '';

function extractBlockLines(block: any): string[] {
  if (!block || typeof block !== 'object') return [];
  const c = block.content || {};
  const lines: string[] = [];
  const add = (...values: unknown[]) => {
    const text = values.map(clean).filter(Boolean).join(' — ');
    if (text) lines.push(text);
  };
  const examples = (items: any[] = []) => items.forEach(item => add(item.it, item.fr ? `(${item.fr})` : ''));

  switch (block.type) {
    case 'dialogue':
      (c.lines || []).forEach((line: any) => add(line.speaker ? `${line.speaker}:` : '', line.it, line.fr ? `(${line.fr})` : ''));
      break;
    case 'vocab_cards':
    case 'chips':
      (c.items || []).forEach((item: any) => add(item.it || item.label || item.text, item.fr));
      break;
    case 'rules_table':
      add(c.title);
      (c.rows || []).forEach((row: any) => add(row.label, ...(row.cells || [])));
      break;
    case 'rule_cards':
      (c.cards || []).forEach((card: any) => {
        add(card.title, card.text);
        examples(card.examples);
      });
      break;
    case 'example_list':
      examples(c.examples);
      break;
    case 'steps_text':
      (c.steps || []).forEach((step: any) => add(step.title, step.it, step.fr ? `(${step.fr})` : ''));
      break;
    case 'key_value_list':
      (c.rows || []).forEach((row: any) => add(row.key, row.it, row.fr ? `(${row.fr})` : ''));
      break;
    case 'tip':
    case 'warning':
      add(c.text);
      break;
    case 'recap':
      (c.bullets || []).forEach((item: any) => add(item));
      if (c.model) add(c.model.it, c.model.fr);
      break;
    case 'formula':
      (c.formulas || []).forEach((formula: any) => {
        add(formula.label, (formula.parts || []).map((part: any) => part.text).join(' '));
        examples(formula.examples);
      });
      break;
    case 'exceptions':
      (c.items || []).forEach((item: any) => {
        add(item.rule, item.explanation);
        examples(item.examples);
      });
      break;
    case 'module':
      add(c.title);
      (c.blocks || []).forEach((child: any) => lines.push(...extractBlockLines(child)));
      break;
    case 'discovery':
      // Les questions et consignes d'activités ne sont pas du contenu de cours.
      break;
    default:
      // Fallback lisible pour les futurs types de blocs.
      Object.entries(c).forEach(([key, value]) => {
        if (['audio', 'id', 'source', 'steps'].includes(key)) return;
        if (typeof value === 'string' || typeof value === 'number') add(value);
        else if (Array.isArray(value)) value.forEach(item => {
          if (typeof item === 'string') add(item);
          else if (item && typeof item === 'object') add(item.it, item.fr, item.text, item.title, item.label, item.explanation);
        });
      });
  }
  return lines;
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
    const courseLines = (Array.isArray(parsed.blocks) ? parsed.blocks : [])
      .flatMap((block: any) => extractBlockLines(block))
      .filter((line: string, index: number, all: string[]) => all.indexOf(line) === index);
    const courseContent = courseLines.length
      ? courseLines.map((line: string) => `• ${line}`).join('\n')
      : 'Aucun contenu pédagogique exploitable trouvé dans les blocs du cours.';

    return `Crée une carte mentale pédagogique PerckyLingua sur « ${title} ».

Niveau : ${parsed.level || 'non précisé'} · Matière : ${subject}
Langue : ${language}

Organise le cours en carte radiale inspirée de Tony Buzan : un centre illustré, 3 à 7 branches principales selon le contenu, puis des sous-branches hiérarchisées. Utilise des mots-clés et formulations courtes, sans paragraphes. Regroupe les idées proches, supprime les doublons et reste fidèle au cours : n'invente aucune règle ni information. Intègre les exceptions et exemples auprès de la notion concernée. Ne crée pas de branche « À retenir » ou de résumé final.

Identité visuelle PerckyLingua : illustration pédagogique rétro chaleureuse inspirée des manuels scolaires des années 1960 et de l'esprit de la méthode Boscher (sans reproduire ses illustrations). Dessins simples faits à la main, expressifs et utiles à la compréhension. Branches organiques et courbes, couleurs distinctes par branche. Palette : bleu #072A3F, bleu #0B3C5D, vert #2FA36B, vert italien #009246, rouge #CE2B37, orange, jaune, violet et turquoise. Fond blanc pur #FFFFFF. Pas de 3D, photoréalisme, emojis, cliparts génériques, texture papier, dégradés ni ombres.

Format : une seule image A4 paysage, 297 × 210 mm (ratio 1,414:1), composée pour remplir harmonieusement la page. Prévois une petite marge de sécurité, aucun élément coupé et des textes lisibles à l'impression. Pas de filigrane ni de titre décoratif.

CONTENU DU COURS
${courseContent}`;
  }, [parsed, language]);

  return (
    <section className="mt-4 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="rounded-lg bg-[#072a3f] p-2 text-white"><Sparkles size={17} /></span>
          <div>
            <h3 className="text-sm font-bold text-[#072a3f]">Générateur de prompt — Mind map</h3>
            <p className="mt-1 text-xs text-slate-600">Un prompt court, avec le contenu du cours extrait automatiquement.</p>
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
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><FileText size={14} /> Prompt généré</span><span className="text-[10px] text-slate-500">{Array.isArray(parsed.blocks) ? parsed.blocks.length : 0} blocs analysés</span></div>
            <textarea readOnly value={prompt} className="max-h-72 min-h-48 w-full resize-y bg-white p-3 font-sans text-[11px] leading-relaxed text-slate-700 focus:outline-none" />
          </div>
          <button type="button" onClick={() => onCopy(prompt, 'Prompt du mind map copié dans le presse-papiers.')} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d]"><Copy size={15} /> Copier le prompt</button>
        </>
      )}
    </section>
  );
};
