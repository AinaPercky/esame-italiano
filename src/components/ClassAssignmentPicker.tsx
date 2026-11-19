import React, { useMemo, useState } from 'react';
import { Check, Globe2, Search, Users, X } from 'lucide-react';
import { ClassRoom } from '../types';

interface ClassAssignmentPickerProps {
  classes: ClassRoom[];
  selectedClassIds: string[];
  isGlobal: boolean;
  onSelectedClassIdsChange: (ids: string[]) => void;
  onGlobalChange: (value: boolean) => void;
  compact?: boolean;
}

export const ClassAssignmentPicker: React.FC<ClassAssignmentPickerProps> = ({
  classes,
  selectedClassIds,
  isGlobal,
  onSelectedClassIdsChange,
  onGlobalChange,
  compact = false
}) => {
  const [search, setSearch] = useState('');
  const activeClasses = useMemo(
    () => classes.filter(item => !item.archived_at),
    [classes]
  );
  const filteredClasses = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return activeClasses.filter(item => item.name.toLocaleLowerCase().includes(query));
  }, [activeClasses, search]);

  const toggleClass = (id: string) => {
    const next = selectedClassIds.includes(id)
      ? selectedClassIds.filter(value => value !== id)
      : [...selectedClassIds, id];
    onSelectedClassIdsChange(next);
    if (isGlobal) onGlobalChange(false);
  };

  const selectAll = () => onSelectedClassIdsChange(activeClasses.map(item => item.id));
  const clearAll = () => onSelectedClassIdsChange([]);

  return (
    <section className={`rounded-2xl border border-[#d8e6ee] bg-white ${compact ? 'p-3' : 'p-4 sm:p-5'}`} aria-labelledby="class-assignment-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#0b3c5d]" />
            <h4 id="class-assignment-title" className="text-sm font-bold text-[#072a3f]">Diffusion de l’examen</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Choisissez les classes qui pourront passer cette épreuve.
          </p>
        </div>
        <span className="mt-1 inline-flex w-fit items-center rounded-full bg-[#e6f0f7] px-2.5 py-1 text-[11px] font-bold text-[#0b3c5d]">
          {isGlobal ? 'Toutes les classes' : `${selectedClassIds.length} classe${selectedClassIds.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={!isGlobal}
          onClick={() => onGlobalChange(false)}
          className={`flex min-h-[66px] items-center gap-3 rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d] ${!isGlobal ? 'border-[#0b3c5d] bg-[#f2f7fa] ring-1 ring-[#0b3c5d]/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${!isGlobal ? 'bg-[#0b3c5d] text-white' : 'bg-slate-100 text-slate-500'}`}>
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-[#072a3f]">Classes sélectionnées</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">Une ou plusieurs classes précises</span>
          </span>
          {!isGlobal && <Check className="h-4 w-4 shrink-0 text-[#2FA36B]" />}
        </button>

        <button
          type="button"
          aria-pressed={isGlobal}
          onClick={() => onGlobalChange(true)}
          className={`flex min-h-[66px] items-center gap-3 rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d] ${isGlobal ? 'border-[#2FA36B] bg-[#f1faf5] ring-1 ring-[#2FA36B]/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isGlobal ? 'bg-[#2FA36B] text-white' : 'bg-slate-100 text-slate-500'}`}>
            <Globe2 className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-[#072a3f]">Toutes les classes</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">Inclut aussi les classes futures</span>
          </span>
          {isGlobal && <Check className="h-4 w-4 shrink-0 text-[#2FA36B]" />}
        </button>
      </div>

      {!isGlobal && (
        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Rechercher une classe…"
                aria-label="Rechercher une classe"
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-[#0b3c5d] focus:bg-white focus:ring-2 focus:ring-[#0b3c5d]/10"
              />
            </label>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <button type="button" onClick={selectAll} className="min-h-9 text-[#0b3c5d] hover:underline">Tout sélectionner</button>
              <button type="button" onClick={clearAll} disabled={selectedClassIds.length === 0} className="min-h-9 text-slate-500 hover:text-rose-600 disabled:opacity-40">Effacer</button>
            </div>
          </div>

          <div className="mt-2 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="group" aria-label="Classes disponibles">
            {filteredClasses.map(item => {
              const checked = selectedClassIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleClass(item.id)}
                  className={`flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d] ${checked ? 'border-[#9bc6ad] bg-[#f1faf5]' : 'border-slate-200 bg-white hover:border-[#b7d3e4] hover:bg-[#f7fafc]'}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-[#2FA36B] bg-[#2FA36B] text-white' : 'border-slate-300 bg-white'}`}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{item.name}</span>
                  {checked && <span className="text-[10px] font-bold text-[#278451]">Incluse</span>}
                </button>
              );
            })}
            {filteredClasses.length === 0 && (
              <p className="col-span-full rounded-lg bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                {activeClasses.length === 0 ? 'Aucune classe active disponible.' : 'Aucune classe ne correspond à cette recherche.'}
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className={`text-[11px] font-medium ${selectedClassIds.length ? 'text-slate-500' : 'text-rose-600'}`}>
              {selectedClassIds.length
                ? `${selectedClassIds.length} classe${selectedClassIds.length > 1 ? 's' : ''} sélectionnée${selectedClassIds.length > 1 ? 's' : ''}`
                : 'Sélectionnez au moins une classe pour continuer.'}
            </p>
            {selectedClassIds.length > 0 && (
              <button type="button" onClick={clearAll} className="inline-flex min-h-8 items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600">
                <X className="h-3 w-3" /> Réinitialiser
              </button>
            )}
          </div>
        </div>
      )}

      {isGlobal && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#c8e7d3] bg-[#f1faf5] p-3">
          <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-[#278451]" />
          <p className="text-[11px] leading-relaxed text-[#276344]">
            Cet examen sera visible dans chaque classe, y compris celles qui seront créées plus tard. Aucune sélection manuelle n’est nécessaire.
          </p>
        </div>
      )}
    </section>
  );
};
