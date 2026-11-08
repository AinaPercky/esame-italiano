import React from 'react';
import type { VerbesTrousDefinition, VerbesTrousAnswerKeyPhrase } from '../../utils/verbesTrous';
import { VerbesTrousQuestion } from './VerbesTrousQuestion';

type Props = {
  definition: VerbesTrousDefinition;
  answerKey: VerbesTrousAnswerKeyPhrase[];
  onChange: (definition: VerbesTrousDefinition, answerKey: VerbesTrousAnswerKeyPhrase[]) => void;
};

const splitLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

export const VerbesTrousEditor: React.FC<Props> = ({ definition, answerKey, onChange }) => {
  const updateDefinition = (patch: Partial<VerbesTrousDefinition>) => onChange({ ...definition, ...patch }, answerKey);
  const updatePhrase = (index: number, patch: Partial<VerbesTrousAnswerKeyPhrase>) => {
    const next = [...answerKey];
    next[index] = { ...next[index], ...patch };
    const publicPhrases = definition.phrases.map((phrase, i) => i === index ? { id: next[i].id, debut: next[i].debut, fin: next[i].fin } : phrase);
    onChange({ ...definition, phrases: publicPhrases }, next);
  };
  const addPhrase = () => {
    const id = Date.now();
    const phrase = { id, debut: '', fin: '', verbe: '', reponses: [''] };
    onChange({ ...definition, phrases: [...definition.phrases, { id, debut: '', fin: '' }] }, [...answerKey, phrase]);
  };
  const removePhrase = (index: number) => {
    onChange({ ...definition, phrases: definition.phrases.filter((_, i) => i !== index) }, answerKey.filter((_, i) => i !== index));
  };
  const expectedVerbs = answerKey.map((phrase) => phrase.verbe.trim()).filter(Boolean);
  const duplicateExpected = expectedVerbs.some((verb, i) => expectedVerbs.findIndex((candidate) => candidate.toLocaleLowerCase('it-IT') === verb.toLocaleLowerCase('it-IT')) !== i);
  const duplicateBank = definition.banque.some((verb, i) => definition.banque.findIndex((candidate) => candidate.toLocaleLowerCase('it-IT') === verb.toLocaleLowerCase('it-IT')) !== i);
  const missing = expectedVerbs.filter((verb) => !definition.banque.some((candidate) => candidate.toLocaleLowerCase('it-IT') === verb.toLocaleLowerCase('it-IT')));

  return <div className="mt-3 space-y-4 rounded-xl border border-[#b8cce2] bg-[#f7faff] p-3">
    <p className="text-sm font-bold text-[#1f4e8c]">Verbes à trous avec banque</p>
    <label className="block text-xs font-semibold">Titre<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={definition.titre || ''} onChange={(e) => updateDefinition({ titre: e.target.value })} /></label>
    <label className="block text-xs font-semibold">Consigne<textarea rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm" value={definition.consigne || ''} onChange={(e) => updateDefinition({ consigne: e.target.value })} /></label>
    <label className="block text-xs font-semibold">Banque de verbes (un par ligne, verbes pièges autorisés)<textarea rows={4} className="mt-1 w-full rounded-lg border p-2 font-mono text-sm" value={definition.banque.join('\n')} onChange={(e) => updateDefinition({ banque: splitLines(e.target.value) })} /></label>
    {duplicateBank && <p className="text-xs font-semibold text-rose-700">La banque contient des doublons.</p>}
    {definition.phrases.map((phrase, index) => {
      const key = answerKey[index] || { ...phrase, verbe: '', reponses: [] };
      return <div key={String(phrase.id)} className="space-y-2 rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between"><strong className="text-sm">Phrase {index + 1}</strong><button type="button" onClick={() => removePhrase(index)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-rose-700">Supprimer</button></div>
        <label className="block text-xs font-semibold">Début de phrase<input className="mt-1 w-full rounded-lg border p-2 text-base" value={key.debut} onChange={(e) => updatePhrase(index, { debut: e.target.value })} /></label>
        <label className="block text-xs font-semibold">Fin de phrase<input className="mt-1 w-full rounded-lg border p-2 text-base" value={key.fin} onChange={(e) => updatePhrase(index, { fin: e.target.value })} /></label>
        <label className="block text-xs font-semibold">Verbe attendu<input className="mt-1 w-full rounded-lg border p-2 text-base" value={key.verbe} onChange={(e) => updatePhrase(index, { verbe: e.target.value.trim() })} placeholder="es. addormentarsi" /></label>
        <label className="block text-xs font-semibold">Conjugaisons acceptées (une par ligne)<textarea rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm" value={key.reponses.join('\n')} onChange={(e) => updatePhrase(index, { reponses: splitLines(e.target.value) })} /></label>
      </div>;
    })}
    <button type="button" onClick={addPhrase} className="min-h-11 rounded-xl border border-[#1f4e8c] px-4 text-sm font-bold text-[#1f4e8c]">+ Ajouter une phrase</button>
    {definition.banque.length < definition.phrases.length && <p className="text-xs font-semibold text-rose-700">La banque doit contenir au moins autant de verbes que de phrases.</p>}
    {duplicateExpected && <p className="text-xs font-semibold text-rose-700">Chaque phrase doit avoir un verbe attendu différent.</p>}
    {missing.length > 0 && <p className="text-xs font-semibold text-amber-800">Verbes attendus absents de la banque : {missing.join(', ')}.</p>}
    <div className="rounded-xl border border-dashed p-3">
      <p className="mb-2 text-xs font-bold text-slate-600">Aperçu élève</p>
      <VerbesTrousQuestion definition={definition} answer="" onChange={() => undefined} disabled />
    </div>
  </div>;
};
