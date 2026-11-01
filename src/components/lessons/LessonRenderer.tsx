import React, { useEffect, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, LockKeyhole, MessageCircle, Sparkles, Volume2 } from 'lucide-react';
import { Lesson, LessonBlock, LessonProgress, DiscoveryStep } from '../../types/lessons';
import { cleanLessonSpeechText } from '../../utils/lessonSpeech';
import { buildLessonQuizChoices, compactLessonAnswer, isLessonQuizChoiceCorrect, LessonQuizChoice } from '../../utils/lessonQuiz';
import { isGuidedQuizComplete } from '../../utils/lessonProgress';
import './lessonExperience.css';
import './lessonGuidedQuiz.css';

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

const RichText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(==[^=]+==|\+\+[^+]+\+\+)/g);
  return <>{parts.map((part, i) => {
    const marked = part.match(/^(==|\+\+)(.*)\1$/);
    if (!marked) return <React.Fragment key={i}>{part}</React.Fragment>;
    return <span key={i} className={`lesson-word ${part.startsWith('==') ? 'lesson-word-yellow' : 'lesson-word-green'}`}>{marked[2]}</span>;
  })}</>;
};

const DialogueBlock: React.FC<{ content: any }> = ({ content }) => (
  <section className="lesson-dialogue" aria-label="Dialogue en italien">
    {(content.lines || []).map((line: any, i: number) => (
      <div key={i} className={`lesson-dialogue-line ${line.side === 'right' ? 'right' : ''}`}>
        <div className="lesson-dialogue-speaker">{line.speaker}</div>
        <button type="button" onClick={() => speak(line.it)} className="lesson-bubble" aria-label={`Écouter : ${cleanLessonSpeechText(line.it)}`}>
          <span className="lesson-italian"><RichText text={line.it} /></span>
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

function Block({ block, discovery, onDiscovery, allBlocks, guidedComplete }: {
  block: LessonBlock;
  discovery: DiscoveryState;
  onDiscovery: DiscoveryCallback;
  allBlocks: LessonBlock[];
  guidedComplete: boolean;
}) {
  if (!isBlockVisible(block, guidedComplete)) return null;
  const c = block.content || {};
  if (block.type === 'dialogue') return <DialogueBlock content={c} />;
  if (block.type === 'vocab_cards') return <div className="lesson-card-grid">{(c.items || []).map((x: any, i: number) => <button type="button" className="lesson-vocab-card" key={i} onClick={() => speak(x.it)}><b>{x.it}</b><small>{x.fr}</small><span className="lesson-audio" aria-hidden="true"><Volume2 size={18} /></span></button>)}</div>;
  if (block.type === 'rules_table') return <section className="lesson-table-section">{c.title && <h3>{c.title}</h3>}<div className="lesson-table-wrap"><table className="lesson-table"><thead><tr><th>{c.label || ''}</th>{(c.columns || []).map((x: string) => <th key={x}>{x}</th>)}</tr></thead><tbody>{(c.rows || []).map((row: any, i: number) => <tr key={i}><th>{row.label}</th>{(row.cells || []).map((cell: string, j: number) => <td key={j}><button type="button" onClick={() => speak(cell)}>{cell}</button></td>)}</tr>)}</tbody></table></div></section>;
  if (block.type === 'rule_cards') return <div className="lesson-card-grid">{(c.cards || []).map((card: any, i: number) => <article className="lesson-rule-card" key={i}><h4>{card.title}</h4><p>{card.text}</p>{(card.examples || []).map((e: any, j: number) => <button className="lesson-example" type="button" key={j} onClick={() => speak(e.it)}><b>{e.it}</b><small>{e.fr}</small></button>)}</article>)}</div>;
  if (block.type === 'example_list') return <div className="lesson-example-list">{(c.examples || []).map((e: any, i: number) => <button className="lesson-example" type="button" key={i} onClick={() => speak(e.it)}><b>{e.it}</b><small>{e.fr}</small></button>)}</div>;
  if (block.type === 'steps_text') return <ol className="lesson-steps">{(c.steps || []).map((x: any, i: number) => <li key={i}><strong>{x.title}</strong><button type="button" onClick={() => speak(x.it)}>{x.it}</button><small>{x.fr}</small></li>)}</ol>;
  if (block.type === 'key_value_list') return <dl className="lesson-key-values">{(c.rows || []).map((x: any, i: number) => <React.Fragment key={i}><dt>{x.key}</dt><dd>{x.it}{x.fr && <small>{x.fr}</small>}</dd></React.Fragment>)}</dl>;
  if (block.type === 'chips') return <div className="lesson-chips">{(c.items || []).map((x: any, i: number) => <button type="button" key={i} onClick={() => speak(x.it)}><b>{x.it}</b><small>{x.fr}</small></button>)}</div>;
  if (block.type === 'tip' || block.type === 'warning') return <aside className={`lesson-callout ${block.type}`}><Lightbulb size={20} /><p>{c.text || ''}</p></aside>;
  if (block.type === 'recap') return <aside className="lesson-recap"><Sparkles size={20} /><div><h3>À retenir</h3><ul>{(c.bullets || []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>{c.model && <p><b>{c.model.it}</b> — {c.model.fr}</p>}</div></aside>;
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

const cleanAnswer = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('it')
  .replace(/[.,!?;:()[\]{}“”"'’]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const Feedback: React.FC<{ good: boolean; children: React.ReactNode }> = ({ good, children }) => (
  <div className={`lesson-discovery-feedback ${good ? 'good' : 'try-again'}`} role="status">
    {good ? <Check size={17} /> : <MessageCircle size={17} />}
    <span>{children}</span>
  </div>
);

const DiscoveryTableExercise: React.FC<{ data: any; onResult: (answers: Record<string, string>, correct: boolean) => void; disabled?: boolean }> = ({ data, onResult, disabled }) => {
  const rows = data?.rows || [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const missing = rows.flatMap((row: any, rowIndex: number) => (row.cells || []).map((cell: string, cellIndex: number) => ({ rowIndex, cellIndex, cell })).filter(({ rowIndex, cellIndex }: any) => rows[rowIndex].given?.[cellIndex] !== true));
  const choices = Array.from(new Set<string>(rows.flatMap((row: any) => (row.cells || []) as string[]))).map(value => ({ value, label: value.split(/\s+/).slice(0, 3).join(' ') }));
  const validate = () => {
    const correct = missing.every(({ rowIndex, cellIndex, cell }: any) => cleanAnswer(answers[`${rowIndex}-${cellIndex}`] || '') === cleanAnswer(cell));
    onResult(answers, correct);
  };
  return <div className="lesson-discovery-table-exercise"><div className="lesson-table-wrap"><table className="lesson-table"><thead><tr><th></th>{(data?.columns || []).map((column: string) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row: any, rowIndex: number) => <tr key={rowIndex}><th>{row.label}</th>{(row.cells || []).map((cell: string, cellIndex: number) => {
    const given = row.given?.[cellIndex] === true;
    const key = `${rowIndex}-${cellIndex}`;
    return <td key={cellIndex}>{given ? <span>{cell}</span> : <select disabled={disabled} aria-label={`${row.label}, ${data?.columns?.[cellIndex] || `colonne ${cellIndex + 1}`}`} value={answers[key] || ''} onChange={event => setAnswers(previous => ({ ...previous, [key]: event.target.value }))}><option value="">Choisir…</option>{choices.map(choice => <option key={`${key}-${choice.value}`} value={choice.value}>{choice.label}</option>)}</select>}</td>;
  })}</tr>)}</tbody></table></div><button type="button" className="lesson-discovery-check" onClick={validate} disabled={disabled}>Vérifier le tableau</button></div>;
};

const QuizDropdown: React.FC<{ choices: LessonQuizChoice[]; onSubmit: (choice: LessonQuizChoice) => void; disabled?: boolean }> = ({ choices, onSubmit, disabled }) => {
  const [selectedId, setSelectedId] = useState('');
  const selected = choices.find(choice => choice.id === selectedId);
  return <div className="lesson-quiz-answer"><label><span>Choisissez une réponse (3 mots maximum)</span><select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={disabled || choices.length === 0}><option value="">Sélectionner…</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label><button type="button" className="lesson-discovery-check" disabled={disabled || !selected} onClick={() => selected && onSubmit(selected)}>Vérifier ma réponse</button>{choices.length === 0 && <small>Cette question doit être complétée par l’enseignant avec des choix de réponse.</small>}</div>;
};

function flattenBlocks(blocks: LessonBlock[]): LessonBlock[] {
  return blocks.flatMap(block => [block, ...(block.type === 'module' ? flattenBlocks(block.content?.blocks || []) : [])]);
}

function getCorrectionEntries(step: DiscoveryStep, formulaPieces: string[], targets: string[]): string[] {
  const data = step.data || {};
  const explicitAnswer = data.correct_answer ?? data.correctAnswer ?? data.expected_answer ?? data.answer;
  if (explicitAnswer !== undefined && explicitAnswer !== null && explicitAnswer !== '') {
    return Array.isArray(explicitAnswer) ? explicitAnswer.map(value => compactLessonAnswer(value)) : [compactLessonAnswer(explicitAnswer)];
  }
  if (step.kind === 'choose' || step.kind === 'guess_meaning') {
    const options = data.options || [];
    const markedCorrect = options.filter((option: any) => option.correct === true);
    return (markedCorrect.length ? markedCorrect : options.filter((option: any) => option.correct !== false)).map((option: any) => compactLessonAnswer(option.short_text || option.label || option.text || String(option)));
  }
  if (step.kind === 'highlight') return targets.length ? targets.map(target => compactLessonAnswer(target)) : ['Relisez les mots ciblés.'];
  if (step.kind === 'complete_table') return (data.rows || []).flatMap((row: any) => (row.cells || []).map((cell: string) => compactLessonAnswer(cell)));
  if (step.kind === 'build_formula') return formulaPieces.length ? [compactLessonAnswer(formulaPieces.join(' '))] : ['Consultez la formule.'];
  if (step.kind === 'compare') {
    const options = data.options || data.sentences || [];
    const markedCorrect = options.filter((option: any) => option.correct === true);
    if (markedCorrect.length) return markedCorrect.map((option: any) => compactLessonAnswer(option.short_text || option.label || option.text || option.it || String(option)));
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
  const answerOption = (choice: LessonQuizChoice) => {
    setHasAttempted(true);
    if (!isLessonQuizChoiceCorrect(step, choice)) {
      setFeedback({ good: false, text: choice.reply || step.ko || 'Pas encore. Relisez l’exemple et réessayez.' });
      return;
    }
    prepareAnswer(choice.value, choice.reply || step.ok || step.insight || 'Exact. Vous pouvez continuer.');
  };
  const revealHint = () => onDiscovery(step, { hint: true });
  const targets: string[] = (step.data?.targets || []).map((target: string) => cleanAnswer(target));
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
    {['choose', 'guess_meaning', 'compare', 'free_text', 'highlight', 'build_formula', 'group'].includes(step.kind) && <QuizDropdown key={step.id} choices={quizChoices} onSubmit={answerOption} disabled={done} />}
    {step.kind === 'complete_table' && <DiscoveryTableExercise key={step.id} data={step.data} disabled={done} onResult={(answers, correct) => { setHasAttempted(true); if (correct) prepareAnswer(answers, step.ok || 'Le tableau est complet.'); else setFeedback({ good: false, text: step.ko || 'Certaines cases ne correspondent pas. Vérifiez les formes et réessayez.' }); }} />}
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

export const LessonRenderer: React.FC<{
  lesson: Lesson;
  progress?: LessonProgress | null;
  onProgress?: (progress: LessonProgress['discovery_state'], done?: boolean) => void;
  onQuiz?: (quizRef: string) => void;
  onNext?: () => void;
}> = ({ lesson, progress, onProgress, onQuiz, onNext }) => {
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
  const guidedComplete = !requiresGuidedQuiz || isGuidedQuizComplete(allSteps, discovery.completed, progress?.status);
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
