import React, { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { QuizQuestion } from '../types';
import { getReorderAnswerIds } from '../utils/quizReorder';

export interface QuizReorderListProps {
  question: QuizQuestion;
  answer: string;
  onChange: (newAnswer: string) => void;
  disabled?: boolean;
  theme?: 'amber' | 'navy';
  className?: string;
}

export const QuizReorderList: React.FC<QuizReorderListProps> = ({
  question,
  answer,
  onChange,
  disabled = false,
  theme = 'amber',
  className = ''
}) => {
  const orderedIds = getReorderAnswerIds(question, answer);
  const itemsById = new Map((question.items || []).map((item) => [item.id, item]));

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLOListElement | null>(null);

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const newOrder = [...orderedIds];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    onChange(JSON.stringify(newOrder));
  };

  // HTML5 Drag and Drop handlers (Desktop)
  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    if (disabled || draggedIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLIElement>, targetIndex: number) => {
    if (disabled || draggedIndex === null) return;
    e.preventDefault();
    reorder(draggedIndex, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Touch event handlers (Mobile / Tablet support)
  const handleTouchStart = (index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(25);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (disabled || draggedIndex === null) return;
    const touch = e.touches[0];
    if (!touch) return;

    const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
    const itemElement = elementUnderTouch?.closest('[data-quiz-reorder-index]');
    if (itemElement) {
      const targetIdxStr = itemElement.getAttribute('data-quiz-reorder-index');
      if (targetIdxStr !== null) {
        const targetIdx = parseInt(targetIdxStr, 10);
        if (!isNaN(targetIdx) && targetIdx !== dragOverIndex) {
          setDragOverIndex(targetIdx);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (disabled || draggedIndex === null) return;
    if (dragOverIndex !== null && dragOverIndex !== draggedIndex) {
      reorder(draggedIndex, dragOverIndex);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(35);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      reorder(index, index - 1);
    } else if (e.key === 'ArrowDown' && index < orderedIds.length - 1) {
      e.preventDefault();
      reorder(index, index + 1);
    }
  };

  const isNavy = theme === 'navy';

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Helper guide */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <GripVertical className={`w-4 h-4 shrink-0 ${isNavy ? 'text-[#0b3c5d]' : 'text-amber-800'}`} />
        <span>Glissez-déposez les cartes pour les ranger dans le bon ordre :</span>
      </div>

      <ol
        ref={containerRef}
        className="space-y-2.5"
        aria-label="Éléments à réorganiser par glisser-déposer"
      >
        {orderedIds.map((itemId, itemIndex) => {
          const item = itemsById.get(itemId);
          if (!item) return null;

          const isBeingDragged = draggedIndex === itemIndex;
          const isTarget = dragOverIndex === itemIndex && draggedIndex !== itemIndex;

          const badgeClasses = isNavy
            ? 'bg-[#e6f0f7] text-[#0b3c5d] border-[#0b3c5d]/20'
            : 'bg-amber-100 text-amber-900 border-amber-300';

          const borderHoverClasses = isNavy
            ? 'hover:border-[#0b3c5d] hover:shadow-md'
            : 'hover:border-amber-500 hover:shadow-md';

          const activeRingClasses = isNavy
            ? 'ring-2 ring-[#0b3c5d] ring-offset-2 border-[#0b3c5d] bg-[#e6f0f7]/40 scale-[1.01]'
            : 'ring-2 ring-amber-700 ring-offset-2 border-amber-700 bg-amber-50/50 scale-[1.01]';

          return (
            <li
              key={item.id}
              data-quiz-reorder-index={itemIndex}
              draggable={!disabled}
              onDragStart={(e) => handleDragStart(e, itemIndex)}
              onDragOver={(e) => handleDragOver(e, itemIndex)}
              onDragLeave={() => handleDragLeave(itemIndex)}
              onDrop={(e) => handleDrop(e, itemIndex)}
              onDragEnd={handleDragEnd}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`group relative flex min-h-14 items-center gap-3 rounded-2xl border-2 bg-white p-3 shadow-xs transition-all select-none ${
                disabled ? 'cursor-default opacity-85' : 'cursor-grab active:cursor-grabbing'
              } ${isBeingDragged ? 'opacity-40 border-dashed scale-[0.98]' : 'border-slate-200'} ${
                isTarget ? activeRingClasses : !isBeingDragged && !disabled ? borderHoverClasses : ''
              }`}
            >
              {/* Drag Handle with Grip icon */}
              <div
                onTouchStart={() => handleTouchStart(itemIndex)}
                onKeyDown={(e) => handleKeyDown(e, itemIndex)}
                tabIndex={disabled ? -1 : 0}
                role="button"
                aria-label={`Déplacer l'élément "${item.text}"`}
                aria-grabbed={isBeingDragged}
                className={`flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors focus:outline-hidden focus:ring-2 ${
                  isNavy
                    ? 'group-hover:text-[#0b3c5d] focus:ring-[#0b3c5d]'
                    : 'group-hover:text-amber-800 focus:ring-amber-700'
                } ${disabled ? 'pointer-events-none' : 'touch-none'}`}
              >
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Order Number Badge */}
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl font-mono text-xs font-black border shadow-xs transition-colors ${badgeClasses}`}
              >
                {itemIndex + 1}
              </span>

              {/* Item Text */}
              <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800 sm:text-base">
                {item.text}
              </span>

              {/* Visual Drag Indicator badge */}
              {!disabled && (
                <span className="hidden sm:inline-flex items-center text-[10px] uppercase font-bold tracking-wider text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Glisser
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
