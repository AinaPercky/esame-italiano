import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Download, GripVertical, Lightbulb, LockKeyhole, MessageCircle, RotateCcw, Sparkles, Volume2, X } from 'lucide-react';
import { Lesson, LessonBlock, LessonProgress, DiscoveryStep } from '../../types/lessons';
import { cleanLessonSpeechText } from '../../utils/lessonSpeech';
import { buildLessonOrderItems, buildLessonQuizChoices, getLessonExpectedOrder, isLessonFreeTextCorrect, isLessonOrderCorrect, isLessonQuizChoiceCorrect, LessonOrderItem, LessonQuizChoice, moveLessonOrderItem, normalizeLessonAnswer, normalizeLessonText } from '../../utils/lessonQuiz';
import { isGuidedQuizComplete } from '../../utils/lessonProgress';
import { buildScreens, getFirstDiscoveryScreenIndex, getFirstLessonScreenIndex, lessonScreenSegment, LessonScreen } from '../../utils/lessonScreens';
import { downloadLessonPdf } from '../../utils/lessonPdf';

const TYPE_META: Record<string, { label: string; color: string; soft: string }> = {
  grammaire: { label: 'Grammaire', color: '#2f6fd6', soft: '#e8f1ff' },
  vocabulaire: { label: 'Vocabulaire', color: '#178a55', soft: '#e4f7ee' },
  fonction: { label: 'Fonction', color: '#c2570a', soft: '#fff0e3' },
  theme: { label: 'Thème', color: '#d7263d', soft: '#ffe8ed' },
  prononciation: { label: 'Prononciation', color: '#7a4fd0', soft: '#f0eaff' }
};

export const lessonTypeMeta = (type: string) => TYPE_META[type] || TYPE_META.grammaire;

function speak(text: string) {
  const cleanText = cleanLessonSpeechText(text);
  if (!cleanText || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'it-IT';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

export const AudioButton: React.FC<{ text: string }> = ({ text }) => (
  <button type="button" onClick={() => speak(text)} className="lesson-audio" aria-label={`Écouter : ${cleanLessonSpeechText(text)}`}>
    <Volume2 size={18} />
  </button>
);

export const TypeTag: React.FC<{ type: string }> = ({ type }) => {
  const meta = lessonTypeMeta(type);
  return <span className="lesson-type-tag" style={{ background: meta.color }}>{meta.label}</span>;
};

const RichText: React.FC<{ text: string; revealHighlights?: boolean }> = ({ text, revealHighlights = false }) => {
  const parts = text.split(/(==[^=]+==|\+\+[^+]+\+\+)/g);
  return <>{parts.map((part, i) => {
    const marked = part.match(/^(==|\+\+)(.*)\1$/);
    if (!marked) return <React.Fragment key={i}>{part}</React.Fragment>;
    if (!revealHighlights) return <React.Fragment key={i}>{marked[2]}</React.Fragment>;
    return <span key={i} className={`lesson-word ${part.startsWith('==') ? 'lesson-word-yellow' : 'lesson-word-green'}`}>{marked[2]}</span>;
  })}</>;
};

const DialogueBlock: React.FC<{ content: any; revealHighlights?: boolean }> = ({ content, revealHighlights = false }) => (
  <section className="lesson-dialogue" aria-label="Dialogue en italien">
    {(content.lines || []).map((line: any, i: number) => (
      <div key={i} className={`lesson-dialogue-line ${line.side === 'right' ? 'right' : ''}`}>
        <div className="lesson-dialogue-speaker">{line.speaker}</div>
        <button type="button" onClick={() => speak(line.it)} className="lesson-bubble" aria-label={`Écouter : ${cleanLessonSpeechText(line.it)}`}>
          <span className="lesson-italian"><RichText text={line.it} revealHighlights={revealHighlights} /></span>
          <span className="lesson-translation">{line.fr}</span>
          <span className="lesson-audio" aria-hidden="true"><Volume2 size={18} /></span>
        </button>
      </div>
    ))}
  </section>
);

interface DiscoveryState {
  completed: string[];
  hints: Record<string, number>;
  revealed: string[];
  notebook: string[];
  answers: Record<string, string>;
}

type DiscoveryCallback = (step: DiscoveryStep, value: any) => void;

const COURSE_BLOCK_TYPES = new Set(['rules_table', 'rule_cards', 'steps_text', 'key_value_list', 'tip', 'warning', 'formula', 'exceptions', 'recap']);

function isBlockVisible(block: LessonBlock, guidedComplete: boolean): boolean {
  if (!guidedComplete && COURSE_BLOCK_TYPES.has(block.type)) return false;
  if (block.type === 'module') {
    const children = block.content?.blocks || [];
    return children.some((child: LessonBlock) => isBlockVisible(child, guidedComplete));
  }
  return true;
}

function Block({ block, discovery, onDiscovery, allBlocks, guidedComplete, revealHighlights }: {
  block: LessonBlock;
  discovery: DiscoveryState;
  onDiscovery: DiscoveryCallback;
  allBlocks: LessonBlock[];
  guidedComplete: boolean;
  revealHighlights?: boolean;
}) {
  if (!isBlockVisible(block, guidedComplete)) return null;
  const c = block.content || {};
  if (block.type === 'dialogue') return <DialogueBlock content={c} revealHighlights={revealHighlights} />;
  if (block.type === 'vocab_cards') return <div className="lesson-card-grid">{(c.items || []).map((x: any, i: number) => <button type="button" className="lesson-vocab-card" key={i} onClick={() => speak(x.it)}><b>{x.it}</b><small>{x.fr}</small><span className="lesson-audio" aria-hidden="true"><Volume2 size={18} /></span></button>)}</div>;
  if (block.type === 'rules_table') return <section className="lesson-table-section">{c.title && <h3>{c.title}</h3>}<div className="lesson-table-wrap"><table className="lesson-table"><thead><tr><th>{c.label || ''}</th>{(c.columns || []).map((x: string) => <th key={x}>{x}</th>)}</tr></thead><tbody>{(c.rows || []).map((row: any, i: number) => <tr key={i}><th>{row.label}</th>{(row.cells || []).map((cell: string, j: number) => <td key={j}><button type="button" onClick={() => speak(cell)}>{cell}</button></td>)}</tr>)}</tbody></table></div></section>;
  if (block.type === 'rule_cards') return <div className="lesson-card-grid">{(c.cards || []).map((card: any, i: number) => <article className="lesson-rule-card" key={i}><h4>{card.title}</h4><p>{card.text}</p>{(card.examples || []).map((e: any, j: number) => <button className="lesson-example" type="button" key={j} onClick={() => speak(e.it)}><b>{e.it}</b><small>{e.fr}</small></button>)}</article>)}</div>;
  if (block.type === 'example_list') return <div className="lesson-example-list">{(c.examples || []).map((e: any, i: number) => <button className="lesson-example" type="button" key={i} onClick={() => speak(e.it)}><b>{e.it}</b><small>{e.fr}</small></button>)}</div>;
  if (block.type === 'steps_text') return <ol className="lesson-steps">{(c.steps || []).map((x: any, i: number) => <li key={i}><strong>{x.title}</strong><button type="button" onClick={() => speak(x.it)}>{x.it}</button><small>{x.fr}</small></li>)}</ol>;
  if (block.type === 'key_value_list') return <dl className="lesson-key-values">{(c.rows || []).map((x: any, i: number) => <React.Fragment key={i}><dt>{x.key}</dt><dd>{x.it}{x.fr && <small>{x.fr}</small>}</dd></React.Fragment>)}</dl>;
  if (block.type === 'chips') return <div className="lesson-chips">{(c.items || []).map((x: any, i: number) => <button type="button" key={i} onClick={() => speak(x.it)}><b>{x.it}</b><small>{x.fr}</small></button>)}</div>;
  if (block.type === 'tip' || block.type === 'warning') return <aside className={`lesson-callout ${block.type}`}><Lightbulb size={20} /><p>{c.text || ''}</p></aside>;
  if (block.type === 'recap') {
    const keyPoints: string[] = Array.isArray(c.bullets) ? c.bullets : [];
    return <aside className="lesson-recap" aria-label="À retenir">
      <header className="lesson-recap-header">
        <span className="lesson-recap-icon" aria-hidden="true"><Sparkles size={20} /></span>
        <div className="lesson-recap-heading">
          <span className="lesson-recap-eyebrow">Fiche mémo</span>
          <h3>À retenir</h3>
          <p>Les repères essentiels pour ancrer la leçon.</p>
        </div>
        <span className="lesson-recap-count">{keyPoints.length} {keyPoints.length === 1 ? 'repère' : 'repères'}</span>
      </header>
      {keyPoints.length > 0 && <ul className="lesson-recap-list">
        {keyPoints.map((point, index) => <li key={`${index}-${point}`}>
          <span className="lesson-recap-marker" aria-hidden="true"><Check size={15} /></span>
          <span>{point}</span>
        </li>)}
      </ul>}
      {c.model && <section className="lesson-recap-model" aria-label="Phrase modèle">
        <span className="lesson-recap-model-label"><BookOpen size={15} /> Phrase modèle</span>
        {c.model.it && <p className="lesson-recap-model-italian">{c.model.it}</p>}
        {c.model.fr && <p className="lesson-recap-model-french">{c.model.fr}</p>}
      </section>}
    </aside>;
  }
  if (block.type === 'formula') return <section className="lesson-formula"><h3>{c.title || 'Formule générale'}</h3>{(c.formulas || []).map((f: any, i: number) => <div key={i} className="lesson-formula-item"><b>{f.label}</b><div className="lesson-formula-parts">{(f.parts || []).map((part: any, j: number) => <span key={j} className={`formula-${part.kind}`}>{part.text}{part.hint && <small>{part.hint}</small>}</span>)}</div>{(f.examples || []).map((e: any, j: number) => <button className="lesson-example" type="button" key={j} onClick={() => speak(e.it)}><b>{e.it}</b><small>{e.fr}</small></button>)}</div>)}</section>;
  if (block.type === 'exceptions') return <section className="lesson-exceptions"><h3>{c.title || 'Exceptions'}</h3>{(c.items || []).map((x: any, i: number) => <article key={i}><strong>{x.rule}</strong><p>{x.explanation}</p>{(x.examples || []).map((e: any, j: number) => <button className="lesson-example" type="button" key={j} onClick={() => speak(e.it)}><b>{e.it}</b><small>{e.fr}</small></button>)}</article>)}</section>;
  if (block.type === 'module') return <ModuleBlock content={c} discovery={discovery} onDiscovery={onDiscovery} allBlocks={allBlocks} guidedComplete={guidedComplete} />;
  if (block.type === 'discovery') return <DiscoveryBlock content={c} discovery={discovery} onDiscovery={onDiscovery} allBlocks={allBlocks} />;
  return null;
}

const ModuleBlock: React.FC<{ content: any; discovery: DiscoveryState; onDiscovery: DiscoveryCallback; allBlocks: LessonBlock[]; guidedComplete: boolean }> = ({ content, discovery, onDiscovery, allBlocks, guidedComplete }) => {
  const [open, setOpen] = useState(true);
  const visibleBlocks = (content.blocks || []).filter((block: LessonBlock) => isBlockVisible(block, guidedComplete));
  if (!visibleBlocks.length) return null;
  return <section className="lesson-module"><button type="button" className="lesson-module-toggle" onClick={() => setOpen(!open)}><span>{content.emoji || '📘'} {content.title}</span><TypeTag type={content.tag_type || 'theme'} />{open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}</button>{open && <div className="lesson-module-body">{visibleBlocks.map((block: LessonBlock, i: number) => <Block key={block.id || i} block={block} discovery={discovery} onDiscovery={onDiscovery} allBlocks={allBlocks} guidedComplete={guidedComplete} />)}</div>}</section>;
};

const Feedback: React.FC<{ good: boolean; children: React.ReactNode }> = ({ good, children }) => (
  <div className={`lesson-discovery-feedback ${good ? 'good' : 'try-again'}`} role="status">
    {good ? <Check size={17} /> : <MessageCircle size={17} />}
    <span>{children}</span>
  </div>
);

const DiscoveryTableExercise: React.FC<{ data: any; onResult: (answers: Record<string, string>, correct: boolean) => void; disabled?: boolean; verifySignal?: number; hideCheck?: boolean }> = ({ data, onResult, disabled, verifySignal = 0, hideCheck = false }) => {
  const rows = data?.rows || [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const missing = rows.flatMap((row: any, rowIndex: number) => (row.cells || []).map((cell: string, cellIndex: number) => ({ rowIndex, cellIndex, cell })).filter(({ rowIndex, cellIndex }: any) => rows[rowIndex].given?.[cellIndex] !== true));
  const choices = Array.from(new Set<string>(rows.flatMap((row: any) => (row.cells || []) as string[]))).map(value => ({ value, label: normalizeLessonText(value) }));
  const validate = () => {
    const correct = missing.every(({ rowIndex, cellIndex, cell }: any) => normalizeLessonAnswer(answers[`${rowIndex}-${cellIndex}`] || '') === normalizeLessonAnswer(cell));
    onResult(answers, correct);
  };
  useEffect(() => { if (verifySignal > 0) validate(); }, [verifySignal]);
  return <div className="lesson-discovery-table-exercise"><div className="lesson-table-wrap"><table className="lesson-table"><thead><tr><th></th>{(data?.columns || []).map((column: string) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row: any, rowIndex: number) => <tr key={rowIndex}><th>{row.label}</th>{(row.cells || []).map((cell: string, cellIndex: number) => {
    const given = row.given?.[cellIndex] === true;
    const key = `${rowIndex}-${cellIndex}`;
    return <td key={cellIndex}>{given ? <span>{cell}</span> : <select disabled={disabled} aria-label={`${row.label}, ${data?.columns?.[cellIndex] || `colonne ${cellIndex + 1}`}`} value={answers[key] || ''} onChange={event => setAnswers(previous => ({ ...previous, [key]: event.target.value }))}><option value="">Choisir…</option>{choices.map(choice => <option key={`${key}-${choice.value}`} value={choice.value}>{choice.label}</option>)}</select>}</td>;
  })}</tr>)}</tbody></table></div>{!hideCheck && <button type="button" className="lesson-discovery-check" onClick={validate} disabled={disabled}>Vérifier le tableau</button>}</div>;
};

const QuizDropdown: React.FC<{ choices: LessonQuizChoice[]; onSubmit: (choice: LessonQuizChoice | null) => void; disabled?: boolean; verifySignal?: number; hideCheck?: boolean }> = ({ choices, onSubmit, disabled, verifySignal = 0, hideCheck = false }) => {
  const [selectedId, setSelectedId] = useState('');
  const selected = choices.find(choice => choice.id === selectedId);
  useEffect(() => { if (verifySignal > 0) onSubmit(selected || null); }, [verifySignal]);
  return <div className="lesson-quiz-answer"><label><span>Choisissez une réponse</span><select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={disabled || choices.length === 0}><option value="">Sélectionner…</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>{!hideCheck && <button type="button" className="lesson-discovery-check" disabled={disabled || !selected} onClick={() => onSubmit(selected || null)}>Vérifier ma réponse</button>}{choices.length === 0 && <small>Cette question ne contient aucun choix de réponse.</small>}</div>;
};

const FreeTextAnswer: React.FC<{ onSubmit: (answer: string) => void; disabled?: boolean; verifySignal?: number; hideCheck?: boolean }> = ({ onSubmit, disabled = false, verifySignal = 0, hideCheck = false }) => {
  const [answer, setAnswer] = useState('');
  const answerId = useId();
  useEffect(() => { if (verifySignal > 0) onSubmit(answer); }, [verifySignal]);
  return <div className="lesson-quiz-answer lesson-free-text-answer">
    <label htmlFor={answerId}><span>Rédigez votre réponse</span>
      <textarea id={answerId} rows={3} value={answer} onChange={event => setAnswer(event.target.value)} disabled={disabled} placeholder="Saisissez votre réponse complète…" />
    </label>
    {!hideCheck && <button type="button" className="lesson-discovery-check" disabled={disabled || !answer.trim()} onClick={() => onSubmit(answer)}>Vérifier ma réponse</button>}
  </div>;
};

function initialOrder(items: LessonOrderItem[], data: any): LessonOrderItem[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const expected = getLessonExpectedOrder(data, items);
  if (expected?.length === shuffled.length && shuffled.length > 1
    && shuffled.every((item, index) => normalizeLessonAnswer(item.value) === normalizeLessonAnswer(expected[index]))) {
    shuffled.push(shuffled.shift()!);
  }
  return shuffled;
}

const ReorderAnswer: React.FC<{ data: any; onSubmit: (values: string[], correct: boolean) => void; disabled?: boolean; verifySignal?: number; hideCheck?: boolean }> = ({ data, onSubmit, disabled = false, verifySignal = 0, hideCheck = false }) => {
  const [items, setItems] = useState<LessonOrderItem[]>(() => initialOrder(buildLessonOrderItems(data), data));
  const instructionId = useId();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [keyboardLiftedId, setKeyboardLiftedId] = useState<string | null>(null);
  const activeDragIndex = useRef<number | null>(null);
  const moveItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    setItems(current => moveLessonOrderItem(current, from, to));
    activeDragIndex.current = to;
  };
  const submit = () => {
    const values = items.map(item => item.value);
    onSubmit(values, isLessonOrderCorrect(data, values));
  };
  useEffect(() => { if (verifySignal > 0) submit(); }, [verifySignal]);
  const startPointerDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number, item: LessonOrderItem) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    activeDragIndex.current = index;
    setDraggingId(item.id);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Certains navigateurs ne gèrent pas pointer capture. */ }
  };
  const movePointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const from = activeDragIndex.current;
    if (from === null) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-order-index]');
    if (!target) return;
    const to = Number(target.dataset.orderIndex);
    if (Number.isInteger(to) && to !== from) moveItem(from, to);
  };
  const finishPointerDrag = () => {
    activeDragIndex.current = null;
    setDraggingId(null);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, item: LessonOrderItem, index: number) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setKeyboardLiftedId(current => current === item.id ? null : item.id);
      return;
    }
    if (event.key === 'Escape') {
      setKeyboardLiftedId(null);
      return;
    }
    if (keyboardLiftedId !== item.id || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const to = Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
    moveItem(index, to);
  };
  return <div className="lesson-order-exercise">
    <p className="lesson-order-instructions" id={instructionId}>Faites glisser les éléments pour les remettre dans l’ordre. Au clavier : Espace pour saisir/déposer, puis ↑ ou ↓ pour déplacer.</p>
    <ol className="lesson-order-list" aria-describedby={instructionId} aria-label="Éléments à ordonner">
      {items.map((item, index) => <li key={item.id} data-order-index={index} className={`lesson-order-item ${draggingId === item.id || keyboardLiftedId === item.id ? 'is-dragging' : ''}`} aria-posinset={index + 1} aria-setsize={items.length}>
        <button type="button" className="lesson-order-handle" disabled={disabled} aria-label={`Déplacer ${item.label}`} aria-pressed={keyboardLiftedId === item.id} onPointerDown={event => startPointerDrag(event, index, item)} onPointerMove={movePointerDrag} onPointerUp={finishPointerDrag} onPointerCancel={finishPointerDrag} onLostPointerCapture={finishPointerDrag} onKeyDown={event => handleKeyDown(event, item, index)}>
          <GripVertical size={18} aria-hidden="true" /><span className="lesson-order-position">{index + 1}</span><span>{item.label}</span>
        </button>
      </li>)}
    </ol>
    {!hideCheck && <button type="button" className="lesson-discovery-check" disabled={disabled || items.length < 2} onClick={submit}>Vérifier l’ordre</button>}
    {items.length < 2 && <small>Ajoutez au moins deux éléments à ordonner dans le contenu de la leçon.</small>}
  </div>;
};

function flattenBlocks(blocks: LessonBlock[]): LessonBlock[] {
  return blocks.flatMap(block => [block, ...(block.type === 'module' ? flattenBlocks(block.content?.blocks || []) : [])]);
}

function getDirectCourseBlocks(blocks: LessonBlock[] = []): LessonBlock[] {
  return blocks.flatMap(block => {
    if (block.type === 'dialogue' || block.type === 'discovery') return [];
    if (block.type === 'module') {
      const children = getDirectCourseBlocks(block.content?.blocks || []);
      return children.length ? [{ ...block, content: { ...block.content, blocks: children } }] : [];
    }
    return [block];
  });
}

function getCorrectionEntries(step: DiscoveryStep, formulaPieces: string[], targets: string[]): string[] {
  const data = step.data || {};
  if (step.kind === 'reorder' || step.kind === 'order') return getLessonExpectedOrder(data) || ['Consultez les éléments dans leur ordre attendu.'];
  const explicitAnswer = data.accepted_answers ?? data.acceptedAnswers ?? data.alternatives ?? data.variants
    ?? data.correct_answer ?? data.correctAnswer ?? data.expected_answer ?? data.answer;
  if (explicitAnswer !== undefined && explicitAnswer !== null && explicitAnswer !== '') {
    return Array.isArray(explicitAnswer) ? explicitAnswer.map(value => normalizeLessonText(value)) : [normalizeLessonText(explicitAnswer)];
  }
  if (step.kind === 'choose' || step.kind === 'guess_meaning') {
    const options = data.options || [];
    const markedCorrect = options.filter((option: any) => option.correct === true);
    return (markedCorrect.length ? markedCorrect : options.filter((option: any) => option.correct !== false)).map((option: any) => normalizeLessonText(option.text || option.label || option.short_text || String(option)));
  }
  if (step.kind === 'highlight') return targets.length ? targets.map(target => normalizeLessonText(target)) : ['Relisez les mots ciblés.'];
  if (step.kind === 'complete_table') return (data.rows || []).flatMap((row: any) => (row.cells || []).map((cell: string) => normalizeLessonText(cell)));
  if (step.kind === 'build_formula') return formulaPieces.length ? [normalizeLessonText(formulaPieces.join(' '))] : ['Consultez la formule.'];
  if (step.kind === 'compare') {
    const options = data.options || data.sentences || [];
    const markedCorrect = options.filter((option: any) => option.correct === true);
    if (markedCorrect.length) return markedCorrect.map((option: any) => normalizeLessonText(option.text || option.it || option.label || option.short_text || String(option)));
  }
  return [step.insight || step.hints?.[0] || 'Comparez votre réponse avec les exemples et la règle de la leçon.'];
}

const DiscoveryBlock: React.FC<{ content: any; discovery: DiscoveryState; onDiscovery: DiscoveryCallback; allBlocks: LessonBlock[] }> = ({ content, discovery, onDiscovery, allBlocks }) => {
  const steps: DiscoveryStep[] = content.steps || [];
  const firstIncomplete = steps.findIndex(item => !discovery.completed.includes(item.id));
  const initialStepIndex = firstIncomplete >= 0 ? firstIncomplete : Math.max(steps.length - 1, 0);
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex);
  const step = steps[currentStepIndex];
  const [feedback, setFeedback] = useState<{ good: boolean; text: string } | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);
  const done = step ? discovery.completed.includes(step.id) : false;
  const hintCount = step ? discovery.hints[step.id] || 0 : 0;
  const sourceId = content.source || step?.data?.source;
  const sourceBlock = sourceId ? allBlocks.find(block => block.id === sourceId) : undefined;

  useEffect(() => {
    setFeedback(null);
    setHasAttempted(false);
  }, [step?.id]);

  if (!step) return null;
  const stepIndex = currentStepIndex;
  const prepareAnswer = (answer: any, message = step.ok || step.insight || 'Bien joué, vous avez trouvé.') => {
    setFeedback({ good: true, text: message });
    onDiscovery(step, answer);
  };
  const answerOption = (choice: LessonQuizChoice | null) => {
    setHasAttempted(true);
    if (!choice) {
      setFeedback({ good: false, text: 'Choisissez une réponse avant de vérifier.' });
      return;
    }
    if (!isLessonQuizChoiceCorrect(step, choice)) {
      setFeedback({ good: false, text: choice.reply || step.ko || 'Pas encore. Relisez l’exemple et réessayez.' });
      return;
    }
    prepareAnswer(choice.value, choice.reply || step.ok || step.insight || 'Exact. Vous pouvez continuer.');
  };
  const answerFreeText = (answer: string) => {
    setHasAttempted(true);
    if (!answer.trim()) {
      setFeedback({ good: false, text: 'Saisissez une réponse avant de vérifier.' });
      return;
    }
    if (!isLessonFreeTextCorrect(step, answer)) {
      setFeedback({ good: false, text: step.ko || 'La réponse ne correspond pas encore. Réessayez sans raccourcir votre phrase.' });
      return;
    }
    prepareAnswer(answer, step.ok || step.insight || 'Réponse enregistrée. Vous pouvez continuer.');
  };
  const answerOrder = (values: string[], correct: boolean) => {
    setHasAttempted(true);
    if (correct) prepareAnswer(values, step.ok || step.insight || 'Ordre correct. Vous pouvez continuer.');
    else setFeedback({ good: false, text: step.ko || 'L’ordre ne correspond pas encore à la réponse attendue. Réessayez.' });
  };
  const revealHint = () => onDiscovery(step, { hint: true });
  const targets: string[] = (step.data?.targets || []).map((target: string) => normalizeLessonAnswer(target));
  const sourceLines = sourceBlock?.type === 'dialogue'
    ? (sourceBlock.content?.lines || []).map((line: any) => ({ speaker: line.speaker, text: line.it }))
    : step.data?.text ? [{ speaker: '', text: step.data.text }] : [];
  const formulaBlock = step.data?.formula_block ? allBlocks.find(block => block.id === step.data.formula_block) : undefined;
  const formula = formulaBlock?.content?.formulas?.[Number(step.data?.formula_index) || 0];
  const formulaPieces: string[] = (step.data?.pieces || formula?.parts?.map((part: any) => part.text) || ['préposition', '+', 'article défini', '→', 'forme collée']).map((piece: any) => typeof piece === 'string' ? piece : piece.text);
  const contextWords = sourceLines.flatMap((line: any) => cleanLessonSpeechText(line.text).match(/[\p{L}\p{M}]+/gu) || []);
  const quizChoices = buildLessonQuizChoices(step, contextWords, formulaPieces.join(' '));
  const showCorrection = discovery.revealed.includes(step.id);
  const correctionEntries = getCorrectionEntries(step, formulaPieces, targets);

  return <section className="lesson-discovery" aria-labelledby={`discovery-${step.id}`}>
    <div className="lesson-discovery-head"><span className="lesson-discovery-icon"><Sparkles size={19} /></span><div><span>Quiz de découverte guidée</span><small>Question {Math.min(stepIndex + 1, steps.length)} sur {steps.length}</small></div></div>
    <div className="lesson-discovery-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepIndex + (done ? 1 : 0)}><span style={{ width: `${Math.min(100, ((stepIndex + (done ? 1 : 0)) / Math.max(steps.length, 1)) * 100)}%` }} /></div>
    <h3 id={`discovery-${step.id}`}>{step.prompt}</h3>
    {step.kind === 'highlight' && <div className="lesson-highlight-exercise">{sourceLines.map((line: any, i: number) => <p className="lesson-highlight-phrase" key={i}>{line.speaker && <strong>{line.speaker}</strong>}{cleanLessonSpeechText(line.text)}</p>)}</div>}
    {step.kind === 'complete_table' && <DiscoveryTableExercise key={step.id} data={step.data} disabled={done} onResult={(answers, correct) => { setHasAttempted(true); if (correct) prepareAnswer(answers, step.ok || 'Le tableau est complet.'); else setFeedback({ good: false, text: step.ko || 'Certaines cases ne correspondent pas. Vérifiez les formes et réessayez.' }); }} />}
    {step.kind === 'free_text' && <FreeTextAnswer key={step.id} onSubmit={answerFreeText} disabled={done} />}
    {(step.kind === 'reorder' || step.kind === 'order') && <ReorderAnswer key={step.id} data={step.data} onSubmit={answerOrder} disabled={done} />}
    {['choose', 'guess_meaning', 'compare', 'highlight', 'build_formula', 'group'].includes(step.kind) && <QuizDropdown key={step.id} choices={quizChoices} onSubmit={answerOption} disabled={done} />}
    {feedback && <Feedback good={feedback.good}>
      {feedback.text}
    </Feedback>}
    {hintCount > 0 && <p className="lesson-hint"><Lightbulb size={15} /> {step.hints?.[hintCount - 1] || 'Relisez attentivement les exemples de la leçon.'}</p>}
    {showCorrection && <aside className="lesson-discovery-correction" aria-live="polite"><h4><BookOpen size={17} /> Correction</h4><ul>{correctionEntries.map((entry, i) => <li key={i}>{entry}</li>)}</ul>{step.insight && <p><strong>À retenir :</strong> {step.insight}</p>}</aside>}
    <div className="lesson-discovery-actions">
      <button type="button" onClick={revealHint} disabled={hintCount >= 3 || done}><Lightbulb size={15} /> Indice {hintCount ? `${hintCount}/3` : ''}</button>
      <button type="button" onClick={() => onDiscovery(step, { reveal: true })} aria-expanded={showCorrection} disabled={!hasAttempted && !done}><BookOpen size={15} /> {showCorrection ? 'Correction affichée' : 'Voir la correction'}</button>
    </div>
    {done && !feedback?.good && <Feedback good>Étape terminée. Passez à la suite de la leçon.</Feedback>}
    <nav className="lesson-discovery-navigation" aria-label="Navigation dans la découverte guidée">
      <button type="button" onClick={() => setCurrentStepIndex(index => Math.max(0, index - 1))} disabled={stepIndex === 0}><ChevronLeft size={17} /> Précédent</button>
      <span>Étape {stepIndex + 1} / {steps.length}</span>
      <button type="button" onClick={() => setCurrentStepIndex(index => Math.min(steps.length - 1, index + 1))} disabled={stepIndex >= steps.length - 1}>Suivant <ChevronRight size={17} /></button>
    </nav>
  </section>;
};

export const LessonFullPreview: React.FC<{
  lesson: Lesson;
  progress?: LessonProgress | null;
  revealAll?: boolean;
  onProgress?: (progress: LessonProgress['discovery_state'], done?: boolean) => void;
  onQuiz?: (quizRef: string) => void;
  onNext?: () => void;
}> = ({ lesson, progress, revealAll = false, onProgress, onQuiz, onNext }) => {
  const meta = lessonTypeMeta(lesson.type);
  const savedState = progress?.discovery_state || {};
  const [discovery, setDiscovery] = useState<DiscoveryState>({
    completed: savedState.completedSteps || [],
    hints: savedState.hintsUsed || {},
    revealed: savedState.revealedSteps || [],
    notebook: savedState.notebook || [],
    answers: savedState.freeTextAnswers || {}
  });
  const allBlocks = flattenBlocks(lesson.blocks);
  const allSteps = allBlocks.flatMap(block => block.type === 'discovery' ? block.content?.steps || [] : []);
  const requiresGuidedQuiz = lesson.method === 'inductive' && allSteps.length > 0;
  const guidedComplete = revealAll || !requiresGuidedQuiz || isGuidedQuizComplete(allSteps, discovery.completed, progress?.status);
  const handleDiscovery = (step: DiscoveryStep, value: any) => {
    const completed = [...discovery.completed];
    const revealed = [...discovery.revealed];
    const notebook = [...discovery.notebook];
    const answers = { ...discovery.answers };
    const hints = { ...discovery.hints };
    if (value?.hint) hints[step.id] = Math.min(3, (hints[step.id] || 0) + 1);
    else if (value?.reveal) {
      if (!revealed.includes(step.id)) revealed.push(step.id);
    } else {
      if (!completed.includes(step.id)) completed.push(step.id);
      if (typeof value === 'string') answers[step.id] = value;
      else if (Array.isArray(value)) answers[step.id] = JSON.stringify(value);
      if (step.insight && !notebook.includes(step.insight)) notebook.push(step.insight);
    }
    const next = { ...discovery, completed, hints, revealed, notebook, answers };
    setDiscovery(next);
    onProgress?.({ completedSteps: completed, hintsUsed: hints, revealedSteps: revealed, notebook, freeTextAnswers: answers }, allSteps.length > 0 && isGuidedQuizComplete(allSteps, completed));
  };
  const completed = progress?.status === 'done';
  const completedCount = guidedComplete ? allSteps.length : allSteps.filter(step => discovery.completed.includes(step.id)).length;
  const remainingSteps = allSteps.filter(step => !discovery.completed.includes(step.id));

  return <div className="lessons-root" style={{ '--lesson-accent': meta.color, '--lesson-soft': meta.soft } as React.CSSProperties}>
    <div className="lesson-reader">
      <header className="lesson-reader-header">
        <div className="lesson-reader-heading"><TypeTag type={lesson.type} /><span className="lesson-meta">{lesson.level} · {lesson.duration_min} min · {lesson.method === 'inductive' ? 'Découverte guidée' : 'Cours direct'}</span></div>
        <span className="lesson-status">{completed ? 'Terminée' : 'En cours'}</span>
      </header>
      <h1>{lesson.title_it}</h1>
      <p className="lesson-title-fr">{lesson.title_fr}</p>
      <section className="lesson-objective"><BookOpen size={21} /><div><b>À la fin de la leçon</b><p>{lesson.objective}</p></div></section>
      {allSteps.length > 0 && <div className="lesson-overall-progress"><span>Quiz de découverte</span><strong>{completedCount}/{allSteps.length} questions</strong><div role="progressbar" aria-valuemin={0} aria-valuemax={allSteps.length} aria-valuenow={completedCount}><span style={{ width: `${Math.min(100, (completedCount / allSteps.length) * 100)}%` }} /></div></div>}
      {requiresGuidedQuiz && !guidedComplete && <aside className="lesson-course-locked" role="status"><LockKeyhole size={19} /><div><b>Quiz validés : {completedCount}/{allSteps.length} — le cours reste verrouillé</b><p>Une réponse n’est comptée qu’après le message « Exact » ou « Correct ». Il reste {remainingSteps.length} question(s) à valider :</p><ul>{remainingSteps.map(step => <li key={step.id}>{step.prompt}</li>)}</ul></div></aside>}
      {lesson.blocks.map((block, i) => <Block key={block.id || i} block={block} discovery={discovery} onDiscovery={handleDiscovery} allBlocks={allBlocks} guidedComplete={guidedComplete} />)}
      {discovery.notebook.length > 0 && <aside className="lesson-notebook"><h3><Sparkles size={18} /> Ce que j’ai découvert</h3><ul>{discovery.notebook.map((item, i) => <li key={i}>{item}</li>)}</ul></aside>}
      <footer className="lesson-reader-footer">
        {lesson.quiz_ref && <button type="button" className="lesson-primary" onClick={() => onQuiz?.(lesson.quiz_ref!)}>Aller au quiz <ChevronRight size={18} /></button>}
        {onNext && <button type="button" className="lesson-secondary" onClick={onNext}>Leçon suivante <ChevronRight size={18} /></button>}
        {!completed && <button type="button" className="lesson-complete" disabled={!guidedComplete} onClick={() => onProgress?.(discovery, true)}><Check size={18} /> {guidedComplete ? 'Marquer comme terminée' : 'Terminez le quiz guidé d’abord'}</button>}
      </footer>
    </div>
  </div>;
};

export const LessonRenderer = LessonFullPreview;

type LessonPlayerProps = {
  lesson: Lesson;
  progress?: LessonProgress | null;
  avatarUrl?: string | null;
  profileName?: string;
  onProgress?: (progress: LessonProgress['discovery_state'], done?: boolean, screen?: number) => void;
  onQuiz?: (quizRef: string) => void;
  onExit?: () => void;
  showClose?: boolean;
};

type StepScreen = Extract<LessonScreen, { kind: 'step' }>;

const LessonQuestionScreen: React.FC<{
  screen: StepScreen;
  allBlocks: LessonBlock[];
  completed: boolean;
  verifySignal: number;
  onResult: (correct: boolean, answer: unknown, feedback: string, insight?: string) => void;
}> = ({ screen, allBlocks, completed, verifySignal, onResult }) => {
  const { step, block, stepIndex, total } = screen;
  const sourceId = block.content?.source || step.data?.source;
  const sourceBlock = sourceId ? allBlocks.find(candidate => candidate.id === sourceId) : undefined;
  const sourceLines = sourceBlock?.type === 'dialogue'
    ? (sourceBlock.content?.lines || []).map((line: any) => ({ speaker: line.speaker, text: line.it }))
    : step.data?.text ? [{ speaker: '', text: step.data.text }] : [];
  const formulaBlock = step.data?.formula_block ? allBlocks.find(candidate => candidate.id === step.data.formula_block) : undefined;
  const formula = formulaBlock?.content?.formulas?.[Number(step.data?.formula_index) || 0];
  const formulaText = (step.data?.pieces || formula?.parts?.map((part: any) => part.text) || []).map((part: any) => typeof part === 'string' ? part : part?.text).join(' ');
  const contextWords = sourceLines.flatMap((line: any) => cleanLessonSpeechText(line.text).match(/[\p{L}\p{M}]+/gu) || []);
  const choices = buildLessonQuizChoices(step, contextWords, formulaText);
  const [feedback, setFeedback] = useState<{ good: boolean; text: string } | null>(null);

  const report = (answer: unknown, correct: boolean, choiceReply?: string) => {
    const message = correct
      ? [choiceReply || step.ok || 'Exact.', step.insight].filter(Boolean).join(' ')
      : choiceReply || step.ko || 'Pas encore. Réessayez avec une autre réponse.';
    setFeedback({ good: correct, text: message });
    onResult(correct, answer, message, step.insight);
  };

  const handleChoice = (choice: LessonQuizChoice | null) => {
    if (!choice) {
      setFeedback({ good: false, text: 'Choisissez une réponse avant de vérifier.' });
      onResult(false, null, 'Choisissez une réponse avant de vérifier.');
      return;
    }
    report(choice.value, isLessonQuizChoiceCorrect(step, choice), choice.reply);
  };
  const handleFreeText = (answer: string) => {
    if (!answer.trim()) {
      report(answer, false, 'Saisissez une réponse avant de vérifier.');
      return;
    }
    report(answer, isLessonFreeTextCorrect(step, answer));
  };
  const handleOrder = (values: string[], correct: boolean) => {
    report(values, correct);
  };

  const handleTable = (answers: Record<string, string>, correct: boolean) => {
    report(JSON.stringify(answers), correct);
  };

  return <section className="lesson-player-question" aria-labelledby={`player-question-${step.id}`}>
    <div className="lesson-player-kicker">Découverte · Question {stepIndex} sur {total}</div>
    <h1 id={`player-question-${step.id}`}>{step.prompt}</h1>
    {step.kind === 'highlight' && sourceLines.length > 0 && <div className="lesson-highlight-exercise">{sourceLines.map((line: any, index: number) => <p className="lesson-highlight-phrase" key={index}>{line.speaker && <strong>{line.speaker}</strong>}<RichText text={line.text} revealHighlights={completed} /></p>)}</div>}
    {step.kind === 'complete_table'
      ? <DiscoveryTableExercise key={step.id} data={step.data} disabled={completed} verifySignal={verifySignal} hideCheck onResult={handleTable} />
      : step.kind === 'free_text'
        ? <FreeTextAnswer key={step.id} onSubmit={handleFreeText} disabled={completed} verifySignal={verifySignal} hideCheck />
        : step.kind === 'reorder' || step.kind === 'order'
          ? <ReorderAnswer key={step.id} data={step.data} onSubmit={handleOrder} disabled={completed} verifySignal={verifySignal} hideCheck />
          : <QuizDropdown key={step.id} choices={choices} onSubmit={handleChoice} disabled={completed} verifySignal={verifySignal} hideCheck />}
    {feedback && <Feedback good={feedback.good}>{feedback.text}</Feedback>}
    {completed && !feedback?.good && <Feedback good>Réponse déjà validée. Continuez.</Feedback>}
  </section>;
};

export const LessonPlayer: React.FC<LessonPlayerProps> = ({ lesson, progress, avatarUrl, profileName, onProgress, onQuiz, onExit, showClose = true }) => {
  const screens = useMemo(() => buildScreens(lesson), [lesson]);
  const savedState = progress?.discovery_state || {};
  const [discovery, setDiscovery] = useState<DiscoveryState>({
    completed: savedState.completedSteps || [],
    hints: savedState.hintsUsed || {},
    revealed: savedState.revealedSteps || [],
    notebook: savedState.notebook || [],
    answers: savedState.freeTextAnswers || {}
  });
  const initialScreen = progress?.status === 'done'
    ? getFirstLessonScreenIndex(screens)
    : Math.min(Math.max(Number(savedState.screen) || 0, 0), screens.length - 1);
  const [screenIndex, setScreenIndex] = useState(initialScreen);
  const [verifySignal, setVerifySignal] = useState(0);
  const [questionPassed, setQuestionPassed] = useState(false);
  const [questionAttempted, setQuestionAttempted] = useState(false);
  const [directReading, setDirectReading] = useState(progress?.status === 'done');
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const screen = screens[screenIndex] || screens[0];
  const meta = lessonTypeMeta(lesson.type);
  const allBlocks = useMemo(() => flattenBlocks(lesson.blocks), [lesson.blocks]);
  const directLesson = useMemo<Lesson>(() => ({ ...lesson, method: 'direct', blocks: getDirectCourseBlocks(lesson.blocks) }), [lesson]);
  const allSteps = allBlocks.flatMap(candidate => candidate.type === 'discovery' ? candidate.content?.steps || [] : []);
  const guidedComplete = !allSteps.length || isGuidedQuizComplete(allSteps, discovery.completed, progress?.status);
  const reviewMode = progress?.status === 'done';

  useEffect(() => {
    setQuestionPassed(screen?.kind === 'step' && discovery.completed.includes(screen.step.id));
  }, [screenIndex, screen?.kind, screen?.kind === 'step' ? screen.step.id : '', discovery.completed]);

  const serialize = (state: DiscoveryState, index: number) => ({
    screen: index,
    completedSteps: state.completed,
    hintsUsed: state.hints,
    revealedSteps: state.revealed,
    notebook: state.notebook,
    freeTextAnswers: state.answers
  });

  const persist = (state: DiscoveryState, index: number, done = false) => {
    onProgress?.(serialize(state, index), done, index);
  };

  const openDirectReading = () => {
    if (screen?.kind === 'done') persist(discovery, screenIndex, true);
    setDirectReading(true);
  };

  const handlePdfDownload = async () => {
    setPdfError('');
    setPdfDownloading(true);
    try {
      await downloadLessonPdf(lesson, { avatarUrl, displayName: profileName });
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'Le téléchargement du PDF a échoué.');
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleStepResult = (currentScreen: StepScreen, correct: boolean, answer: unknown) => {
    setQuestionAttempted(true);
    setQuestionPassed(correct);
    if (!correct || discovery.completed.includes(currentScreen.step.id)) return;
    const next: DiscoveryState = {
      ...discovery,
      completed: [...discovery.completed, currentScreen.step.id],
      revealed: discovery.revealed.includes(currentScreen.step.id) ? discovery.revealed : [...discovery.revealed, currentScreen.step.id],
      answers: { ...discovery.answers, [currentScreen.step.id]: typeof answer === 'string' ? answer : JSON.stringify(answer) },
      notebook: currentScreen.step.insight && !discovery.notebook.includes(currentScreen.step.insight)
        ? [...discovery.notebook, currentScreen.step.insight]
        : discovery.notebook
    };
    setDiscovery(next);
    persist(next, screenIndex);
  };

  const goTo = (nextIndex: number, enforceGuidedGate = true) => {
    let next = Math.min(Math.max(nextIndex, 0), screens.length - 1);
    if (enforceGuidedGate && !guidedComplete && (screens[next]?.kind === 'part' || screens[next]?.kind === 'done')) {
      const firstIncomplete = screens.findIndex(candidate => candidate.kind === 'step' && !discovery.completed.includes(candidate.step.id));
      if (firstIncomplete >= 0) next = firstIncomplete;
    }
    setScreenIndex(next);
    setVerifySignal(0);
    setQuestionAttempted(false);
    setQuestionPassed(screens[next]?.kind === 'step' && discovery.completed.includes((screens[next] as StepScreen).step.id));
    persist(discovery, next);
  };

  const restartGuidedFromBeginning = () => {
    const clean: DiscoveryState = { completed: [], hints: {}, revealed: [], notebook: [], answers: {} };
    const first = 0;
    setDiscovery(clean);
    setScreenIndex(first);
    setQuestionPassed(false);
    setQuestionAttempted(false);
    setVerifySignal(0);
    setDirectReading(false);
    setPdfError('');
    onProgress?.(serialize(clean, first), false, first);
  };

  const handlePrimaryAction = () => {
    if (!screen) return;
    if (screen.kind === 'step') {
      if (!questionPassed) {
        setVerifySignal(value => value + 1);
        return;
      }
      goTo(screenIndex + 1);
      return;
    }
    if (screen.kind === 'done') {
      persist(discovery, screenIndex, true);
      onExit?.();
      return;
    }
    goTo(screenIndex + 1);
  };

  const firstLessonIndex = getFirstLessonScreenIndex(screens);
  const activeSegment = screen ? lessonScreenSegment(screen) : 'lesson';
  const phaseOrder = ['dialogue', 'discovery', 'lesson'];
  const activePhaseIndex = phaseOrder.indexOf(activeSegment);
  const discoveryBlockFor = (block: LessonBlock) => allBlocks.find(candidate => candidate.type === 'discovery' && (
    candidate.content?.source === block.id || (candidate.content?.steps || []).some((step: DiscoveryStep) => step.data?.source === block.id)
  ));
  const highlightsRevealedFor = (block: LessonBlock) => {
    const source = discoveryBlockFor(block);
    return Boolean(source && (source.content?.steps || []).some((step: DiscoveryStep) => step.kind === 'highlight' && (discovery.completed.includes(step.id) || discovery.revealed.includes(step.id))));
  };

  const renderExtraBlocks = (extras: LessonBlock[]) => extras.map((extra, index) => <Block key={extra.id || `extra-${index}`} block={extra} discovery={discovery} onDiscovery={() => undefined} allBlocks={allBlocks} guidedComplete={true} />);
  const renderScreen = (current: LessonScreen) => {
    if (current.kind === 'dialogue') return <><Block block={current.block} discovery={discovery} onDiscovery={() => undefined} allBlocks={allBlocks} guidedComplete={true} revealHighlights={highlightsRevealedFor(current.block)} />{renderExtraBlocks(current.extras)}</>;
    if (current.kind === 'step') return <LessonQuestionScreen key={current.step.id} screen={current} allBlocks={allBlocks} completed={discovery.completed.includes(current.step.id)} verifySignal={verifySignal} onResult={(correct, answer) => handleStepResult(current, correct, answer)} />;
    if (current.kind === 'part') return <><Block block={current.block} discovery={discovery} onDiscovery={() => undefined} allBlocks={allBlocks} guidedComplete={true} revealHighlights={current.block.type === 'dialogue' && highlightsRevealedFor(current.block)} />{renderExtraBlocks(current.extras)}</>;
    return <section className="lesson-player-done"><span className="lesson-player-done-mark"><Check size={30} /></span><p className="lesson-player-kicker">Parcours terminé</p><h1>Ottimo lavoro!</h1><p>Vous avez parcouru cette leçon. Vous pouvez maintenant relire le cours sans refaire le guide.</p>
      <div className="lesson-player-completion-actions">
        <button type="button" className="lesson-player-restart-guide" onClick={restartGuidedFromBeginning}><RotateCcw size={17} /> Reprendre le parcours guidé depuis le début</button>
        <button type="button" className="lesson-player-read-course" onClick={openDirectReading}><BookOpen size={17} /> Lire la leçon directement</button>
        <button type="button" className="lesson-player-download-pdf" onClick={() => void handlePdfDownload()} disabled={pdfDownloading}><Download size={17} /> {pdfDownloading ? 'Préparation du PDF…' : 'Télécharger le PDF A4'}</button>
      </div>
      {pdfError && <p className="lesson-pdf-error" role="alert">{pdfError}</p>}
      {lesson.quiz_ref && <button type="button" className="lesson-player-quiz-link" onClick={() => onQuiz?.(lesson.quiz_ref!)}>Accéder au quiz associé <ChevronRight size={16} /></button>}
    </section>;
  };

  if (directReading) return <div className="lessons-root lesson-direct-reading-root" style={{ '--lesson-accent': meta.color, '--lesson-soft': meta.soft } as React.CSSProperties}>
    <header className="lesson-direct-toolbar">
      {showClose && <button type="button" className="lesson-direct-back" onClick={onExit}><X size={17} /> <span className="hidden sm:inline">Retour aux leçons</span><span className="sm:hidden">Retour</span></button>}
      <div className="lesson-direct-toolbar-copy"><span>Révision autonome</span><strong>{lesson.title_it}</strong></div>
      <div className="lesson-direct-toolbar-actions">
        <button type="button" className="lesson-direct-restart" onClick={restartGuidedFromBeginning} title="Reprendre le dialogue et les quiz guidés depuis le début"><RotateCcw size={16} /> Recommencer le guide</button>
        <button type="button" className="lesson-direct-download" onClick={() => void handlePdfDownload()} disabled={pdfDownloading}><Download size={17} /> {pdfDownloading ? 'Préparation…' : 'Télécharger le PDF A4'}</button>
      </div>
    </header>
    {pdfError && <p className="lesson-pdf-error" role="alert">{pdfError}</p>}
    <LessonFullPreview lesson={directLesson} progress={progress ? { ...progress, status: 'done' } : null} revealAll onQuiz={onQuiz} />
  </div>;

  if (!screen) return null;
  const canRedo = reviewMode && getFirstDiscoveryScreenIndex(screens) < firstLessonIndex;
  const isQuestion = screen.kind === 'step';
  const primaryLabel = screen.kind === 'done' ? 'Terminer la leçon' : isQuestion && !questionPassed ? (questionAttempted ? 'Réessayer' : 'Vérifier') : 'Continuer';

  return <div className="lessons-root lesson-player-root" style={{ '--lesson-accent': meta.color, '--lesson-soft': meta.soft } as React.CSSProperties}>
    <div className="lesson-player-shell">
      <header className="lesson-player-header">
        {showClose && <button type="button" className="lesson-player-close" onClick={onExit} aria-label="Fermer la leçon"><X size={21} /></button>}
        <nav className="lesson-player-segments" aria-label="Progression de la leçon">
          {phaseOrder.map((phase, index) => <div key={phase} className={`lesson-player-segment ${index <= activePhaseIndex ? 'active' : ''} ${phase === activeSegment ? 'current' : ''}`}><span /><small>{phase === 'dialogue' ? 'Dialogue' : phase === 'discovery' ? 'Découverte' : 'Leçon'}</small></div>)}
        </nav>
      </header>
      {canRedo && <button type="button" className="lesson-player-redo" onClick={restartGuidedFromBeginning}><RotateCcw size={14} /> Reprendre le parcours guidé depuis le début</button>}
      {screen.kind === 'step' && guidedComplete && <button type="button" className="lesson-player-skip" onClick={() => goTo(firstLessonIndex, false)}>Voir la règle directement</button>}
      <main className="lesson-player-content" key={screenIndex}>
        {screen.kind === 'dialogue' && <div className="lesson-player-dialogue-heading"><h1>{lesson.title_it}</h1><p>{lesson.title_fr}</p></div>}
        {screen.kind === 'part' && <div className="lesson-player-part-heading"><span>Leçon · {screen.index} / {screen.total}</span>{screen.block.type === 'chips' && <h1>Mots du dialogue</h1>}</div>}
        {renderScreen(screen)}
      </main>
      <footer className="lesson-player-actionbar">
        <div className="lesson-player-actionbar-inner">
          <span>{screen.kind === 'step' ? `Question ${screen.stepIndex} sur ${screen.total}` : screen.kind === 'done' ? 'Fin de la leçon' : screen.kind === 'part' ? `Partie ${screen.index} sur ${screen.total}` : 'Prenez le temps d’observer'}</span>
          <button type="button" onClick={handlePrimaryAction} className="lesson-player-primary"><span>{primaryLabel}</span><ChevronRight size={19} /></button>
        </div>
      </footer>
    </div>
  </div>;
};
