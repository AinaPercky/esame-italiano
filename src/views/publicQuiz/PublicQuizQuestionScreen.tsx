import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { QuizQuestion } from '../../types';
import { QuizFeedbackEntry } from './publicQuizUtils';
import { CORRECTION_DISPLAY_SECONDS } from '../../utils/quizTiming';
import { QuizReorderList } from '../../components/QuizReorderList';
import { QuizClozeInput, parseQuestionClozePrompt } from '../../components/QuizClozeInput';
import { VerbesTrousQuestion } from '../../components/verbesTrous/VerbesTrousQuestion';
import { parseVerbesTrousAnswers, type VerbesTrousAnswerKeyPhrase } from '../../utils/verbesTrous';
import {
  AssessmentCorrectionModal,
  AssessmentQcmOptions,
  AssessmentQuestionHeader,
  AssessmentShell
} from '../../components/AssessmentRunner';

interface PublicQuizQuestionScreenProps {
  question: QuizQuestion;
  quizTitle: string;
  questionIndex: number;
  totalQuestions: number;
  completedMap?: boolean[];
  totalTimeLeftMs: number;
  totalTimeDurationMs: number;
  questionTimeDurationMs: number;
  answer: string;
  isValidated: boolean;
  canGoBack: boolean;
  progressPercent: number;
  timeLeft: number | null;
  timeTone: 'normal' | 'warning' | 'danger';
  feedback?: QuizFeedbackEntry;
  showCorrection: boolean;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onAnswerChange: (value: string) => void;
  onValidate: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export const PublicQuizQuestionScreen: React.FC<PublicQuizQuestionScreenProps> = ({
  question,
  quizTitle,
  questionIndex,
  totalQuestions,
  completedMap,
  totalTimeLeftMs,
  questionTimeDurationMs,
  answer,
  isValidated,
  canGoBack,
  timeLeft,
  feedback,
  showCorrection,
  soundEnabled = true,
  onToggleSound,
  onAnswerChange,
  onValidate,
  onNext,
  onPrevious
}) => {
  const [correctionCountdown, setCorrectionCountdown] = React.useState(CORRECTION_DISPLAY_SECONDS);
  const [confirmIncomplete, setConfirmIncomplete] = React.useState(false);

  const missingVerbPhrases = question.type === 'verbes_trous' && question.verbes_trous
    ? question.verbes_trous.phrases.filter((phrase) => !parseVerbesTrousAnswers(answer)[String(phrase.id)]?.verbe_choisi).length
    : 0;

  const requestValidation = () => {
    if (missingVerbPhrases > 0) setConfirmIncomplete(true);
    else onValidate();
  };

  const isLastQuestion = questionIndex === totalQuestions - 1;
  const questionSecondsRemaining = timeLeft !== null ? Math.max(0, Math.ceil(timeLeft / 1000)) : null;
  const questionTotalSeconds = Math.max(1, Math.ceil(questionTimeDurationMs / 1000));
  const totalSecondsRemaining = Math.max(0, Math.ceil(totalTimeLeftMs / 1000));

  const primaryLabel = !isValidated
    ? question.type === 'verbes_trous' ? 'Corriger' : 'Valider'
    : isLastQuestion
      ? 'Terminer le quiz'
      : 'Question suivante';

  React.useEffect(() => {
    if (!showCorrection || !feedback) return;
    setCorrectionCountdown(CORRECTION_DISPLAY_SECONDS);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const next = Math.max(0, CORRECTION_DISPLAY_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      setCorrectionCountdown(next);
      if (next === 0) {
        clearInterval(interval);
        onNext();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [question.id, showCorrection, feedback, onNext]);

  const clozeInfo = question.type === 'text' ? parseQuestionClozePrompt(question.question) : null;

  return (
    <AssessmentShell
      modeTone="official"
      bannerLabel="Quiz public · Italien · Session chronométrée"
      bannerMobileLabel="Quiz public · Italien"
      kicker="Quiz public · Italien"
      title={quizTitle}
      questionIndex={questionIndex}
      totalQuestions={totalQuestions}
      completedMap={completedMap}
      questionSecondsRemaining={questionSecondsRemaining}
      questionTotalSeconds={questionTotalSeconds}
      totalSecondsRemaining={totalSecondsRemaining}
      soundEnabled={soundEnabled}
      onToggleSound={onToggleSound}
      footerLeft={
        canGoBack ? (
          <button
            type="button"
            onClick={onPrevious}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#d8e6ee] bg-white px-4 text-sm font-bold text-[#072a3f] transition-colors hover:bg-[#f3f8fb]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Précédent</span>
          </button>
        ) : undefined
      }
      footerAction={
        <button
          type="button"
          onClick={isValidated ? onNext : requestValidation}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#072a3f] px-6 py-3 text-sm font-extrabold text-white shadow-md transition-colors hover:bg-[#0b3c5d] active:scale-[.99] sm:w-auto sm:min-w-[230px]"
        >
          {!isValidated ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : isLastQuestion ? (
            <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{primaryLabel}</span>
        </button>
      }
      modals={
        <>
          {confirmIncomplete && (
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#051e2e]/70 p-4 backdrop-blur-xs" role="presentation">
              <section role="alertdialog" aria-modal="true" aria-labelledby="vt-confirm-title" className="w-full max-w-sm rounded-[24px] border border-[#d8e6ee] bg-white p-6 shadow-2xl animate-scale-in">
                <h2 id="vt-confirm-title" className="font-display text-base font-extrabold text-[#072a3f]">
                  Il reste {missingVerbPhrases} phrase{missingVerbPhrases > 1 ? 's' : ''} sans réponse.
                </h2>
                <p className="mt-2 text-sm text-[#46657a]">Corriger quand même ?</p>
                <div className="mt-5 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConfirmIncomplete(false)}
                    className="min-h-[44px] flex-1 rounded-xl border border-[#d8e6ee] bg-white px-3 text-sm font-bold text-[#072a3f] transition-colors hover:bg-[#f3f8fb]"
                  >
                    Continuer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmIncomplete(false);
                      onValidate();
                    }}
                    className="min-h-[44px] flex-1 rounded-xl bg-[#072a3f] px-3 text-sm font-extrabold text-white transition-colors hover:bg-[#0b3c5d]"
                  >
                    Corriger
                  </button>
                </div>
              </section>
            </div>
          )}

          <AssessmentCorrectionModal
            isOpen={Boolean(showCorrection && feedback)}
            isCorrect={Boolean(feedback?.correct)}
            isTimeout={Boolean(feedback && !feedback.correct && !feedback.studentAnswer)}
            questionNumber={questionIndex + 1}
            questionText={question.question}
            studentAnswer={feedback?.studentAnswer || ''}
            expectedAnswer={feedback?.expected || ''}
            explanation={question.explanation}
            points={feedback?.points}
            maxPoints={question.points}
            countdownSeconds={correctionCountdown}
            totalCountdownSeconds={CORRECTION_DISPLAY_SECONDS}
            isLastQuestion={isLastQuestion}
            onContinue={onNext}
          />
        </>
      }
    >
      <AssessmentQuestionHeader
        questionNumber={questionIndex + 1}
        type={question.type}
        points={question.points}
        prompt={clozeInfo?.hasBlanks ? clozeInfo.prompt : question.question}
      />

      {question.type === 'qcm' ? (
        <AssessmentQcmOptions
          options={(question.options || []).map((option) => ({ value: option, label: option }))}
          selectedValue={answer}
          onSelect={(val) => !isValidated && onAnswerChange(val)}
          disabled={isValidated}
        />
      ) : question.type === 'reorder' ? (
        <QuizReorderList
          question={question}
          answer={answer}
          onChange={onAnswerChange}
          disabled={isValidated}
          theme="navy"
        />
      ) : question.type === 'verbes_trous' && question.verbes_trous ? (
        <VerbesTrousQuestion
          definition={question.verbes_trous}
          answer={answer}
          onChange={onAnswerChange}
          disabled={isValidated}
          showCorrection={isValidated && showCorrection}
          answerKey={question.verbes_trous.phrases as VerbesTrousAnswerKeyPhrase[]}
        />
      ) : (
        <QuizClozeInput
          question={question}
          customSentence={clozeInfo?.hasBlanks ? clozeInfo.sentence : undefined}
          answer={answer}
          onChange={onAnswerChange}
          disabled={isValidated}
          theme="navy"
        />
      )}
    </AssessmentShell>
  );
};
