import React from 'react';
import {
  normalizeMotsTrousAnswer,
  validateMotsTrousDefinition,
  type MotsTrousAnswerKeyPhrase,
  type MotsTrousDefinition
} from '../../utils/motsTrous';
import { MotsTrousQuestion } from './MotsTrousQuestion';

type Props = {
  definition: MotsTrousDefinition;
  answerKey: MotsTrousAnswerKeyPhrase[];
  onChange: (definition: MotsTrousDefinition, answerKey: MotsTrousAnswerKeyPhrase[]) => void;
};

const splitLines = (value: string) =>
  value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

export const MotsTrousEditor: React.FC<Props> = ({ definition, answerKey, onChange }) => {
  const pointsParPhrase = Math.max(1, Math.round(Number(definition.points_par_phrase) || 1));

  const updateDefinition = (patch: Partial<MotsTrousDefinition>) =>
    onChange({ ...definition, ...patch }, answerKey);

  const updatePhrase = (index: number, patch: Partial<MotsTrousAnswerKeyPhrase>) => {
    const next = [...answerKey];
    next[index] = { ...next[index], ...patch };
    const publicPhrases = definition.phrases.map((phrase, i) =>
      i === index ? { id: next[i].id, debut: next[i].debut, fin: next[i].fin } : phrase
    );
    onChange({ ...definition, phrases: publicPhrases }, next);
  };

  const addPhrase = () => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const phrase: MotsTrousAnswerKeyPhrase = { id, debut: '', fin: '', mot: '' };
    onChange(
      { ...definition, phrases: [...definition.phrases, { id, debut: '', fin: '' }] },
      [...answerKey, phrase]
    );
  };

  const removePhrase = (index: number) => {
    onChange(
      { ...definition, phrases: definition.phrases.filter((_, i) => i !== index) },
      answerKey.filter((_, i) => i !== index)
    );
  };

  const validationErrors = validateMotsTrousDefinition(definition, answerKey);
  const bankWords = definition.banque || [];

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-[#b8cce2] bg-[#f7faff] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#1f4e8c]">Mots à trous avec banque</p>
        <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-[#0b3c5d]">
          {definition.phrases.length} phrase(s) · {definition.phrases.length * pointsParPhrase} pt(s)
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[#315267]">
          Titre (optionnel)
          <input
            className="mt-1 w-full rounded-lg border border-[#cfe1ec] bg-white p-2 text-sm"
            value={definition.titre || ''}
            onChange={e => updateDefinition({ titre: e.target.value })}
            placeholder="Ex. Lessico della colazione"
          />
        </label>

        <label className="block text-xs font-semibold text-[#315267]">
          Points par phrase
          <input
            type="number"
            min={1}
            max={20}
            className="mt-1 w-full rounded-lg border border-[#cfe1ec] bg-white p-2 text-sm tabular-nums"
            value={pointsParPhrase}
            onChange={e =>
              updateDefinition({
                points_par_phrase: Math.max(1, Math.round(Number(e.target.value) || 1))
              })
            }
          />
        </label>
      </div>

      <label className="block text-xs font-semibold text-[#315267]">
        Consigne (optionnelle)
        <textarea
          rows={2}
          className="mt-1 w-full rounded-lg border border-[#cfe1ec] bg-white p-2 text-sm"
          value={definition.consigne || ''}
          onChange={e => updateDefinition({ consigne: e.target.value })}
          placeholder="Glissez-déposez chaque mot dans la phrase qui lui correspond."
        />
      </label>

      <label className="block text-xs font-semibold text-[#315267]">
        Banque de mots (un par ligne, mots pièges autorisés)
        <textarea
          rows={4}
          className="mt-1 w-full rounded-lg border border-[#cfe1ec] bg-white p-2 font-mono text-sm"
          value={bankWords.join('\n')}
          onChange={e => updateDefinition({ banque: splitLines(e.target.value) })}
          placeholder={'caffè\ncornetto\nsucco\npane'}
        />
      </label>

      <div className="space-y-3">
        {definition.phrases.map((phrase, index) => {
          const key = answerKey[index] || { ...phrase, mot: '' };
          const hasMatchingBankWord = bankWords.some(
            w => normalizeMotsTrousAnswer(w) === normalizeMotsTrousAnswer(key.mot)
          );

          return (
            <div key={String(phrase.id)} className="space-y-2 rounded-xl border border-[#d8e6ee] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-[#072a3f]">Phrase {index + 1}</strong>
                <button
                  type="button"
                  onClick={() => removePhrase(index)}
                  className="min-h-9 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Supprimer
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[#315267]">
                  Début de phrase (avant le trou)
                  <input
                    className="mt-1 w-full rounded-lg border border-[#cfe1ec] p-2 text-sm"
                    value={key.debut}
                    onChange={e => updatePhrase(index, { debut: e.target.value })}
                    placeholder="La mattina bevo un "
                  />
                </label>

                <label className="block text-xs font-semibold text-[#315267]">
                  Fin de phrase (après le trou)
                  <input
                    className="mt-1 w-full rounded-lg border border-[#cfe1ec] p-2 text-sm"
                    value={key.fin}
                    onChange={e => updatePhrase(index, { fin: e.target.value })}
                    placeholder=" caldo al bar."
                  />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[#315267]">
                  Mot attendu (issu de la banque)
                  <input
                    className="mt-1 w-full rounded-lg border border-[#cfe1ec] p-2 text-sm"
                    value={key.mot}
                    onChange={e => updatePhrase(index, { mot: e.target.value })}
                    placeholder="caffè"
                  />
                </label>

                {bankWords.length > 0 && (
                  <label className="block text-xs font-semibold text-[#315267]">
                    Sélection rapide depuis la banque
                    <select
                      className="mt-1 w-full rounded-lg border border-[#cfe1ec] bg-[#f7fafc] p-2 text-sm"
                      value={hasMatchingBankWord ? bankWords.find(w => normalizeMotsTrousAnswer(w) === normalizeMotsTrousAnswer(key.mot)) || '' : ''}
                      onChange={e => {
                        if (e.target.value) updatePhrase(index, { mot: e.target.value });
                      }}
                    >
                      <option value="">Choisir dans la banque…</option>
                      {bankWords.map(w => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addPhrase}
          className="min-h-10 rounded-xl border border-[#1f4e8c] bg-white px-4 py-2 text-xs font-bold text-[#1f4e8c] hover:bg-[#edf5fa]"
        >
          + Ajouter une phrase
        </button>
      </div>

      {validationErrors.length > 0 && (
        <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
          {validationErrors.map(err => (
            <p key={err}>• {err}</p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-[#b8cce2] bg-white p-3">
        <p className="mb-2 text-xs font-bold text-slate-600">Aperçu élève</p>
        <MotsTrousQuestion definition={definition} answer="" onChange={() => undefined} disabled mode="editor" />
      </div>
    </div>
  );
};
