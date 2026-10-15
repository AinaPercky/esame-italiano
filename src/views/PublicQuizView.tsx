import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  Printer,
  ShieldCheck,
  Sparkles,
  School,
  FileCheck2,
  ExternalLink,
  Search,
  ArrowRight,
  RotateCcw,
  Smartphone,
  Check,
  AlertCircle,
  Play,
  Loader2,
  Circle,
  HelpCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Quiz, QuizQuestion, QuizSubmission, ClassRoom } from '../types';

interface PublicQuizViewProps {
  quizId: string; // This is the public_id
  onBackToApp: () => void;
}

export const PublicQuizView: React.FC<PublicQuizViewProps> = ({
  quizId,
  onBackToApp
}) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(0);
  const [score20, setScore20] = useState<number>(0);
  const [feedback, setFeedback] = useState<Record<string, { correct: boolean; points: number; expected: string; studentAnswer: string }>>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [quizDuration, setQuizDuration] = useState<number>(0); // in minutes
  const [quizEndTime, setQuizEndTime] = useState<number | null>(null);

  useEffect(() => {
    const loadQuiz = () => {
      const publicQuiz = dataService.getPublicQuiz(quizId);

      if (publicQuiz) {
        setQuiz(publicQuiz);
        setQuestions(publicQuiz.questions || []);
        setMaxScore(publicQuiz.total_points || 20);
        setQuizDuration(publicQuiz.duration_minutes || 10);

        // Set end time based on duration
        const durationMinutes = publicQuiz.duration_minutes || 10;
        const endTime = Date.now() + (durationMinutes * 60 * 1000);
        setQuizEndTime(endTime);
        setTimeLeft(durationMinutes * 60 * 1000);

        // Start timer
        setStartTime(Date.now());
        setTimerActive(true);

        // Start countdown
        const timer = setInterval(() => {
          const now = Date.now();
          const left = Math.max(0, endTime - now);
          setTimeLeft(left);

          if (left <= 0) {
            setTimerActive(false);
            clearInterval(timer);
            // Auto-submit when time runs out
            handleSubmitQuiz();
          }
        }, 1000);

        return () => clearInterval(timer);
      } else {
        setQuiz(null);
      }
    };

    const cleanup = loadQuiz();
    const unsub = dataService.subscribe(() => {
      if (!submitted) {
        const publicQuiz = dataService.getPublicQuiz(quizId);
        if (!publicQuiz) {
          setQuiz(null);
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
      unsub();
    };
  }, [quizId]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSubmitQuiz = () => {
    if (!quiz) return;

    setSubmitting(true);

    // Calculate score
    let rawScore = 0;
    const newFeedback: Record<string, { correct: boolean; points: number; expected: string; studentAnswer: string }> = {};

    quiz.questions.forEach(q => {
      const studentAns = (answers[q.id] || '').trim();
      const expectedAns = (q.correct_answer || '').trim();
      let isCorrect = false;

      if (q.type === 'qcm') {
        isCorrect = studentAns.toLowerCase() === expectedAns.toLowerCase();
      } else {
        // Text question: case-insensitive, accent-insensitive comparison
        const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
        const normStudent = normalize(studentAns);
        const normExpected = normalize(expectedAns);
        isCorrect = normStudent === normExpected || normStudent.includes(normExpected) || normExpected.includes(normStudent);
      }

      const awarded = isCorrect ? (Number(q.points) || 1) : 0;
      rawScore += awarded;
      newFeedback[q.id] = {
        correct: isCorrect,
        points: awarded,
        expected: expectedAns,
        studentAnswer: studentAns
      };
    });

    const finalScore20 = maxScore > 0 ? Number(((rawScore / maxScore) * 20).toFixed(1)) : 0;

    setScore(rawScore);
    setScore20(finalScore20);
    setFeedback(newFeedback);
    setSubmitted(true);
    setSubmitting(false);

    // IMPORTANT: Do NOT save to database for public quizzes
    // According to requirements: "les résultats des quiz publics ne doivent jamais être enregistrés dans la base de données"
  };

  if (!quiz) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="text-center bg-white rounded-xl p-8 shadow-lg w-full max-w-md">
          <HelpCircle className="w-12 h-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Quiz Introuvable</h2>
          <p className="text-gray-600 mb-6">
            Le quiz demandé n'existe pas, n'est pas publié publiquement ou le lien a expiré.
          </p>
          <button
            onClick={onBackToApp}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
          >
            Retour à l'application
          </button>
        </div>
      </div>
    );
  }

  // Format time left as MM:SS
  const formatTimeLeft = (timeLeftMillis: number | null): string => {
    if (timeLeftMillis === null) return '00:00';
    const totalSeconds = Math.max(0, Math.floor(timeLeftMillis / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl mb-6">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
              <p className="text-sm text-gray-500">{quiz.description || ''}</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs text-gray-500">Durée : {quiz.duration_minutes} min</p>
            <p className="text-xs text-gray-500">Barème : {quiz.total_points} pts</p>
          </div>
        </div>

        {/* Timer */}
        {timerActive && timeLeft !== null && (
          <div className="px-6 py-4 bg-amber-50 border-t">
            <div className="flex items-center justify-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="font-mono font-bold text-amber-800 text-xl">
                {formatTimeLeft(timeLeft)}
              </span>
              <span className="text-sm text-amber-600">Temps restant</span>
            </div>
          </div>
        )}

        {/* Quiz Content or Results */}
        {!submitted ? (
          <form className="p-6 space-y-6" onSubmit={(e) => e.preventDefault()}>
            {/* Questions */}
            <div className="space-y-6">
              {quiz.questions.map((question, index) => (
                <div key={question.id} className="bg-white rounded-lg shadow p-4 border">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">{question.question}</h3>

                      {question.type === 'qcm' && (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-600 font-medium mb-2">
                            Sélectionnez une réponse :
                          </div>
                          {(question.options || []).map((option, optIndex) => (
                            <div key={optIndex} className="flex items-start gap-3">
                              <input
                                type="radio"
                                id={`${question.id}-opt-${optIndex}`}
                                name={`answer-${question.id}`}
                                value={option}
                                checked={answers[question.id] === option}
                                onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                className="form-radio h-4 w-4 text-amber-600"
                              />
                              <label
                                htmlFor={`${question.id}-opt-${optIndex}`}
                                className="text-gray-700 cursor-select"
                              >
                                {option}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}

                      {question.type === 'text' && (
                        <div className="mt-2">
                          <label className="block text-sm text-gray-600 font-medium mb-1">
                            Votre réponse :
                          </label>
                          <input
                            type="text"
                            value={answers[question.id] || ''}
                            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                            placeholder="Tapez votre réponse ici..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}

                      {question.explanation && (
                        <div className="mt-3 p-3 bg-amber-50 rounded text-sm text-amber-800 italic">
                          <strong>Info :</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t">
              <button
                type="button"
                onClick={handleSubmitQuiz}
                disabled={submitting}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Enregistrement en cours...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Soumettre le Quiz</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-6">
            {/* Results */}
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center mb-4">
                <div className={`p-3 rounded-full text-xl font-bold ${
                  score20 >= 15 ? 'bg-emerald-100 text-emerald-800' :
                  score20 >= 10 ? 'bg-amber-100 text-amber-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {score20}/20
                </div>
                <div className="space-y-1 text-left">
                  <p className="text-sm text-gray-600">Score obtenu</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {score} / {maxScore} points ({(score20/20*100).toFixed(0)}%)
                  </p>
                </div>
              </div>

              {/* Feedback */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Correction détaillée</h2>
                <div className="space-y-3">
                  {quiz.questions.map((question) => {
                    const fb = feedback[question.id];
                    if (!fb) return null;

                    return (
                      <div key={question.id} className="p-4 bg-white rounded-lg border">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8">
                            {fb.correct ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-rose-500" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 mb-1">{question.question}</h3>
                            <p className="text-sm text-gray-600 mb-2">
                              <strong>Votre réponse :</strong> {fb.studentAnswer || '(aucune réponse)'}
                            </p>
                            <p className="text-sm text-gray-600 mb-2">
                              <strong>Réponse attendue :</strong> {fb.expected}
                            </p>
                            <p className={`text-sm font-medium ${fb.correct ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {fb.correct ? 'Correct !' : 'Incorrect.'}
                              ({fb.points} point(s) sur {question.points})
                            </p>

                            {question.explanation && (
                              <div className="mt-2 p-3 bg-amber-50 rounded text-sm text-amber-800 italic">
                                <strong>Explication :</strong> {question.explanation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Back Button */}
              <div className="pt-4 border-t">
                <button
                  onClick={onBackToApp}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg"
                >
                  Retour à l'application enseignant
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-gray-500 mt-auto">
        <p>
          <strong>Important :</strong> Ce quiz est public et anonyme. Vos résultats ne sont pas enregistrés
          dans la base de données et ne seront pas consultables par l'enseignant.
        </p>
        <p>
          PerckyLingua • Quiz Public • {new Date().toLocaleDateString('fr-FR')}
        </p>
      </div>
    </div>
  );
};