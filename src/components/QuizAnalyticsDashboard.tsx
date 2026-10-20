import React, { useMemo, useState } from 'react';
import { BarChart3, BookOpen, Lightbulb, TrendingUp, X } from 'lucide-react';
import { ClassRoom, Quiz, QuizQuestion, QuizSubmission, Student } from '../types';
import { calculateQuestionPointsEarned } from '../utils/quizAnswerMatcher';

interface QuizAnalyticsDashboardProps {
  initialClassId: string;
  initialQuizId: string;
  classes: ClassRoom[];
  students: Student[];
  quizzes: Quiz[];
  submissions: QuizSubmission[];
  onClose: () => void;
}

interface AnswerDetail {
  submission: QuizSubmission;
  answer: string;
  expected: string;
  correct: boolean;
  points: number;
  maxPoints: number;
}

interface QuestionAnalysis {
  key: string;
  quizTitle: string;
  questionNumber: number;
  question: QuizQuestion;
  details: AnswerDetail[];
  classDetails: AnswerDetail[];
  classRate: number;
  studentRate: number | null;
}

const scoreOf = (submission: QuizSubmission): number => {
  const score = Number(submission.score_20);
  return Number.isFinite(score) ? Math.max(0, Math.min(20, score)) : 0;
};

const mean = (values: number[]): number | null => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;

const formatScore = (value: number | null): string => value === null ? '—' : `${value.toFixed(1)}/20`;
const fullName = (student?: Student, fallback = 'Élève'): string => student
  ? `${student.first_name} ${student.last_name}`
  : fallback;

const responseFor = (question: QuizQuestion, submission: QuizSubmission): AnswerDetail | null => {
  const feedback = submission.feedback?.[question.id];
  const rawAnswer = submission.answers?.[question.id] ?? feedback?.studentAnswer ?? '';
  if (!rawAnswer.trim() && !feedback) return null;

  const calculated = calculateQuestionPointsEarned(question, rawAnswer);
  return {
    submission,
    answer: feedback?.studentAnswer || rawAnswer || 'Aucune réponse',
    expected: feedback?.expected || question.correct_answer || '—',
    correct: feedback?.correct ?? calculated.isFullyCorrect,
    points: Number.isFinite(Number(feedback?.points)) ? Number(feedback?.points) : calculated.awardedPoints,
    maxPoints: calculated.maxPoints
  };
};

const rateOf = (details: AnswerDetail[]): number | null => {
  if (!details.length) return null;
  const possible = details.reduce((sum, detail) => sum + detail.maxPoints, 0);
  return possible > 0
    ? (details.reduce((sum, detail) => sum + detail.points, 0) / possible) * 100
    : null;
};

const dateLabel = (quiz: Quiz): string => {
  const date = new Date(quiz.launched_at || quiz.created_at);
  return Number.isNaN(date.getTime()) ? 'Date inconnue' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

export const QuizAnalyticsDashboard: React.FC<QuizAnalyticsDashboardProps> = ({
  initialClassId,
  initialQuizId,
  classes,
  students,
  quizzes,
  submissions,
  onClose
}) => {
  const initialClass = classes.some(room => room.id === initialClassId) ? initialClassId : classes[0]?.id || '';
  const [classId, setClassId] = useState(initialClass);
  const [studentId, setStudentId] = useState('');
  const [quizId, setQuizId] = useState(initialQuizId || 'all');

  const classStudents = useMemo(
    () => students.filter(student => student.class_id === classId),
    [students, classId]
  );
  const classStudentIds = useMemo(() => new Set(classStudents.map(student => student.id)), [classStudents]);
  const classQuizzes = useMemo(() => quizzes.filter(quiz => {
    const quizClassIds = quiz.class_ids?.length ? quiz.class_ids : [quiz.class_id];
    return quizClassIds.includes(classId) && (quiz.status !== 'draft' || quiz.id === initialQuizId);
  }), [quizzes, classId, initialQuizId]);
  const visibleQuizzes = useMemo(
    () => classQuizzes.filter(quiz => quizId === 'all' || quiz.id === quizId),
    [classQuizzes, quizId]
  );
  const visibleQuizIds = useMemo(() => new Set(visibleQuizzes.map(quiz => quiz.id)), [visibleQuizzes]);
  const classSubmissions = useMemo(() => submissions.filter(submission =>
    submission.class_id === classId &&
    classStudentIds.has(submission.student_id) &&
    visibleQuizIds.has(submission.quiz_id)
  ), [submissions, classId, classStudentIds, visibleQuizIds]);
  const selectedStudent = classStudents.find(student => student.id === studentId);
  const scopedSubmissions = studentId
    ? classSubmissions.filter(submission => submission.student_id === studentId)
    : classSubmissions;

  const studentMeans = useMemo(() => {
    const means = new Map<string, number>();
    classStudents.forEach(student => {
      const scores = classSubmissions.filter(submission => submission.student_id === student.id).map(scoreOf);
      if (scores.length) means.set(student.id, mean(scores) || 0);
    });
    return means;
  }, [classStudents, classSubmissions]);
  const classAverage = mean(Array.from(studentMeans.values()));
  const studentScores = scopedSubmissions.map(scoreOf);
  const selectedAverage = studentId ? mean(studentScores) : null;
  const primaryAverage = studentId ? selectedAverage : classAverage;
  const successRate = studentScores.length
    ? (studentScores.filter(score => score >= 10).length / studentScores.length) * 100
    : null;
  const assessedStudentCount = studentMeans.size;
  const participationRate = classStudents.length
    ? (assessedStudentCount / classStudents.length) * 100
    : null;

  const questionAnalyses = useMemo(() => {
    const rows: QuestionAnalysis[] = [];
    visibleQuizzes.forEach(quiz => {
      (quiz.questions || []).forEach((question, index) => {
        const classDetails = classSubmissions.flatMap(submission => {
          if (submission.quiz_id !== quiz.id) return [];
          const detail = responseFor(question, submission);
          return detail ? [detail] : [];
        });
        if (!classDetails.length) return;
        const details = studentId
          ? classDetails.filter(detail => detail.submission.student_id === studentId)
          : classDetails;
        rows.push({
          key: `${quiz.id}:${question.id}`,
          quizTitle: quiz.title,
          questionNumber: index + 1,
          question,
          details,
          classDetails,
          classRate: rateOf(classDetails) ?? 0,
          studentRate: studentId ? rateOf(details) : null
        });
      });
    });
    return rows.sort((left, right) => {
      const leftRate = studentId ? (left.studentRate ?? 101) : left.classRate;
      const rightRate = studentId ? (right.studentRate ?? 101) : right.classRate;
      return leftRate - rightRate;
    });
  }, [visibleQuizzes, classSubmissions, studentId]);

  const trend = useMemo(() => visibleQuizzes.map(quiz => {
    const quizSubs = classSubmissions.filter(submission => submission.quiz_id === quiz.id);
    const byStudent = new Map<string, number[]>();
    quizSubs.forEach(submission => {
      const values = byStudent.get(submission.student_id) || [];
      values.push(scoreOf(submission));
      byStudent.set(submission.student_id, values);
    });
    const averageByStudent = Array.from(byStudent.values()).map(values => mean(values) || 0);
    const individualScores = byStudent.get(studentId) || [];
    return {
      quiz,
      classScore: mean(averageByStudent),
      studentScore: studentId ? mean(individualScores) : null
    };
  }).filter(point => point.classScore !== null)
    .sort((left, right) => (left.quiz.launched_at || left.quiz.created_at).localeCompare(right.quiz.launched_at || right.quiz.created_at))
    .slice(-6), [visibleQuizzes, classSubmissions, studentId]);

  const weakest = questionAnalyses
    .filter(row => studentId ? row.studentRate !== null && row.studentRate < 60 : row.classRate < 60)
    .slice(0, 2);
  const trendValues = trend.flatMap(point => {
    const score = studentId ? point.studentScore : point.classScore;
    return score === null ? [] : [score];
  });
  const latestTrend = trendValues.length > 1 ? trendValues[trendValues.length - 1] - trendValues[trendValues.length - 2] : null;
  const selectedName = fullName(selectedStudent, 'cet élève');
  const recommendations: string[] = [];

  if (!scopedSubmissions.length) {
    recommendations.push('Aucun résultat disponible pour cette sélection. Choisissez un autre quiz ou attendez les premières copies avant de tirer une conclusion.');
  } else if (studentId) {
    if (primaryAverage !== null && primaryAverage < 10) {
      recommendations.push(`${selectedName} est sous le seuil de 10/20 (${primaryAverage.toFixed(1)}/20) : reprendre les notions de base avec une activité guidée, puis vérifier la compréhension avec un court exercice.`);
    } else {
      recommendations.push(`${selectedName} obtient ${formatScore(primaryAverage)} : consolider les acquis et proposer progressivement des exercices plus autonomes.`);
    }
    if (weakest[0]) {
      recommendations.push(`Revoir d’abord « ${weakest[0].question.question} » : réussite de l’élève ${Math.round(weakest[0].studentRate ?? 0)}% (classe : ${Math.round(weakest[0].classRate)}%).`);
    }
  } else {
    if (classAverage !== null && classAverage < 10) {
      recommendations.push(`La moyenne des élèves évalués est de ${classAverage.toFixed(1)}/20 : prévoir une reprise collective des points fondamentaux avant d’avancer.`);
    } else {
      recommendations.push(`La moyenne de classe est de ${formatScore(classAverage)} : poursuivre la progression et différencier l’accompagnement des élèves sous 10/20.`);
    }
    if (weakest[0]) {
      recommendations.push(`Priorité de reprise : « ${weakest[0].question.question} » (${Math.round(weakest[0].classRate)}% des points obtenus). Prévoir un exemple corrigé puis un exercice court de transfert.`);
    }
  }
  if (latestTrend !== null) {
    recommendations.push(`Tendance ${studentId ? `de ${selectedStudent?.first_name || 'l’élève'}` : 'de la classe'} entre les deux dernières évaluations : ${latestTrend > 0.4 ? 'en hausse' : latestTrend < -0.4 ? 'en baisse' : 'globalement stable'} (${latestTrend > 0 ? '+' : ''}${latestTrend.toFixed(1)} pt).`);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-analytics-title">
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-800"><BarChart3 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 id="quiz-analytics-title" className="font-display text-lg font-bold text-slate-900 sm:text-xl">Analyse des résultats</h2>
              <p className="mt-0.5 text-xs text-slate-500">Une lecture simple des résultats et des réponses pour guider le prochain cours.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer l’analyse" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </header>

        <main className="space-y-4 overflow-y-auto p-4 sm:p-6">
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3" aria-label="Choisir une analyse">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Classe
              <select value={classId} onChange={event => { setClassId(event.target.value); setStudentId(''); setQuizId('all'); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900">
                {classes.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Élève
              <select value={studentId} onChange={event => setStudentId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900">
                <option value="">Toute la classe</option>
                {classStudents.map(student => <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Quiz
              <select value={visibleQuizIds.has(quizId) ? quizId : 'all'} onChange={event => setQuizId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900">
                <option value="all">Tous les quiz</option>
                {classQuizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}
              </select>
            </label>
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicateurs principaux">
            <Kpi label={studentId ? 'Moyenne de l’élève' : 'Moyenne de la classe'} value={formatScore(primaryAverage)} detail={studentId ? selectedName : 'Moyenne des élèves ayant des résultats'} />
            <Kpi label="Copies analysées" value={String(scopedSubmissions.length)} detail={`${visibleQuizzes.length} quiz dans la sélection`} />
            <Kpi label="Copies ≥ 10/20" value={successRate === null ? '—' : `${Math.round(successRate)}%`} detail="Part des copies au seuil de réussite" />
            <Kpi label="Participation" value={participationRate === null ? '—' : `${Math.round(participationRate)}%`} detail={`${assessedStudentCount} élève(s) avec résultat sur ${classStudents.length}`} />
          </div>

          {!scopedSubmissions.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
              <h3 className="mt-3 text-sm font-bold text-slate-800">Aucun résultat pour cette sélection</h3>
              <p className="mt-1 text-xs text-slate-500">Changez le quiz ou choisissez « Toute la classe » pour consulter d’autres copies.</p>
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><TrendingUp className="h-4 w-4 text-indigo-700" /> Tendance des résultats</h3><p className="mt-1 text-[11px] text-slate-500">Moyenne par quiz, sur les six évaluations les plus récentes.</p></div>
                  {studentId && <span className="text-[10px] text-slate-500">Barre foncée : classe · barre dorée : {selectedStudent?.first_name}</span>}
                </div>
                {trend.length ? <div className="mt-4 space-y-3">{trend.map(point => (
                  <div key={point.quiz.id} className="grid grid-cols-[minmax(90px,1fr)_minmax(100px,2fr)_48px] items-center gap-2 text-[11px] sm:grid-cols-[minmax(150px,1.2fr)_minmax(120px,2fr)_56px]">
                    <span className="truncate font-medium text-slate-700" title={point.quiz.title}>{point.quiz.title}<span className="ml-1 text-slate-400">{dateLabel(point.quiz)}</span></span>
                    <div className="space-y-1">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-700" style={{ width: `${Math.max(0, Math.min(100, (point.classScore || 0) / 20 * 100))}%` }} /></div>
                      {studentId && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(100, (point.studentScore || 0) / 20 * 100))}%` }} /></div>}
                    </div>
                    <span className="text-right font-mono font-bold text-slate-700">{formatScore(studentId ? point.studentScore : point.classScore)}</span>
                  </div>
                ))}</div> : <p className="mt-3 text-xs text-slate-500">La tendance apparaîtra après les premières copies.</p>}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div><h3 className="text-sm font-bold text-slate-900">Analyse et pistes pour l’enseignement</h3>
                    <ul className="mt-2 space-y-2 text-xs leading-relaxed text-slate-700">{recommendations.map((recommendation, index) => <li key={index} className="rounded-lg bg-amber-50/70 px-3 py-2">{recommendation}</li>)}</ul>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BookOpen className="h-4 w-4 text-indigo-700" /> Résultats et réponses par question</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Questions les moins réussies d’abord. Ouvrez une ligne pour lire les réponses réellement données.</p>
                </div>
                {!questionAnalyses.length ? <p className="p-4 text-xs text-slate-500">Aucune réponse détaillée n’est disponible dans les copies sélectionnées.</p> : (
                  <div className="divide-y divide-slate-100">
                    {questionAnalyses.slice(0, 10).map(row => (
                      <details key={row.key} className="group px-4 py-3 sm:px-5">
                        <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-3 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.quizTitle} · Question {row.questionNumber}</span><span className="mt-1 block text-xs font-semibold text-slate-800">{row.question.question}</span></span>
                          <span className="text-right"><span className={`block text-sm font-black ${row.classRate < 60 ? 'text-rose-700' : row.classRate < 80 ? 'text-amber-700' : 'text-emerald-700'}`}>{Math.round(row.classRate)}%</span><span className="text-[9px] text-slate-400">classe{studentId ? ` · élève ${row.studentRate === null ? '—' : `${Math.round(row.studentRate)}%`}` : ''}</span></span>
                        </summary>
                        <div className="mt-3 rounded-lg bg-slate-50 p-3">
                          <p className="mb-2 text-[10px] font-semibold text-slate-500">Réussite calculée sur les points obtenus; {row.classDetails.length} réponse(s) de classe{studentId ? `, ${row.details.length} de ${selectedStudent?.first_name || 'l’élève'}` : ''}.</p>
                          <div className="max-h-64 space-y-2 overflow-y-auto">
                            {studentId && row.details.length === 0 && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">Aucune réponse enregistrée pour cet élève. Les résultats de la classe pour cette question : {row.classDetails.length} réponse(s).</p>}
                            {(studentId ? row.details : row.classDetails).map((detail, detailIndex) => (
                              <div key={`${detail.submission.id}-${detailIndex}`} className="grid gap-1 rounded-md border border-slate-200 bg-white p-2 text-[11px] sm:grid-cols-[minmax(100px,0.8fr)_2fr_1.5fr_auto] sm:items-start">
                                <span className="font-semibold text-slate-700">{detail.submission.student_name || 'Élève'}</span>
                                <span className="break-words text-slate-700"><strong>Réponse :</strong> {detail.answer}</span>
                                <span className="break-words text-slate-500"><strong>Attendu :</strong> {detail.expected}</span>
                                <span className={detail.correct ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{detail.points}/{detail.maxPoints} pt{detail.correct ? ' · correct' : ''}</span>
                              </div>
                            ))}
                          </div>
                          {row.question.explanation && <p className="mt-2 text-[10px] italic text-slate-500">Rappel : {row.question.explanation}</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <span className="hidden text-[10px] text-slate-400 sm:block">Analyse simple • résultats, réponses et pistes pédagogiques</span>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">Fermer l’analyse</button>
        </footer>
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div className="min-h-[94px] rounded-xl border border-slate-200 bg-white p-3.5">
    <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-2 font-mono text-xl font-black text-[#0B3C5D]">{value}</div>
    <div className="mt-1 text-[10px] leading-snug text-slate-500">{detail}</div>
  </div>
);
