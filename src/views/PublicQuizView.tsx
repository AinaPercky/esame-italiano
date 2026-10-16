import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, BookOpen, AlertCircle, Loader2, Play
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { Quiz, QuizQuestion } from '../types';

interface PublicQuizViewProps {
  quizId: string;
  onBackToApp: () => void;
}

export const PublicQuizView: React.FC<PublicQuizViewProps> = ({ quizId, onBackToApp }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [started, setStarted] = useState<boolean>(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  useEffect(() => {
    const loadQuiz = async () => {
      setLoading(true);
      // 1. Essayer d'abord avec le service local
      let q = dataService.getPublicQuiz(quizId);
      
      // 2. Si non trouvé, essayer le service distant
      if (!q) {
        try {
          q = await supabaseService.fetchPublicQuiz(quizId);
        } catch (err) {
          console.error("Erreur chargement quiz distant:", err);
        }
      }

      if (q) {
        setQuiz(q);
        setTimeLeft((q.duration_minutes || 10) * 60);
      }
      setLoading(false);
    };
    loadQuiz();
  }, [quizId]);

  useEffect(() => {
    if (!started || submitted || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [started, submitted, timeLeft]);

  const handleSubmit = () => {
    if (!quiz) return;
    // Simple scoring logic...
    setSubmitted(true);
  };

  if (loading) return <div className="p-10 text-center">Chargement...</div>;
  if (!quiz) return <div className="p-10 text-center">Quiz non trouvé.</div>;

  if (!started) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center">
          <BookOpen className="w-16 h-16 text-emerald-700 mx-auto mb-6" />
          <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">{quiz.title}</h1>
          <p className="text-slate-600 mb-6">{quiz.description}</p>
          <div className="flex gap-4 justify-center text-sm text-slate-500 mb-8">
            <span>{quiz.duration_minutes} min</span>
            <span>•</span>
            <span>{quiz.questions.length} questions</span>
          </div>
          <input
            type="text"
            placeholder="Votre nom"
            className="w-full p-4 mb-6 border rounded-xl"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
          <button
            onClick={() => setStarted(true)}
            disabled={!studentName}
            className="w-full py-4 bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" /> Commencer
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Bar */}
        <div className="h-2 bg-slate-200 rounded-full mb-6">
          <div className="h-full bg-emerald-700 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        
        {/* Timer */}
        <div className={`text-center font-mono font-bold mb-6 ${timeLeft < 120 ? 'text-orange-500' : 'text-slate-600'}`}>
          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </div>

        {/* Question */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Question {currentQuestionIndex + 1} sur {quiz.questions.length}
          </h2>
          <p className="text-lg text-slate-700 mb-8">{currentQuestion.question}</p>
          {/* Options would go here */}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button onClick={() => setCurrentQuestionIndex(p => Math.max(0, p - 1))} disabled={currentQuestionIndex === 0}>Précédent</button>
          <button onClick={() => {
            if (currentQuestionIndex < quiz.questions.length - 1) setCurrentQuestionIndex(p => p + 1);
            else handleSubmit();
          }}>
            {currentQuestionIndex < quiz.questions.length - 1 ? 'Suivant' : 'Terminer'}
          </button>
        </div>
      </div>
    </div>
  );
};
