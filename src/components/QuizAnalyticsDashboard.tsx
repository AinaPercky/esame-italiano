import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ClipboardList,
  Lightbulb,
  Target,
  TrendingUp,
  Users,
  X
} from 'lucide-react';
import { ClassRoom, Quiz, QuizQuestion, QuizSubmission, Student } from '../types';

interface QuizAnalyticsDashboardProps {
  initialClassId: string;
  initialQuizId: string;
  classes: ClassRoom[];
  students: Student[];
  quizzes: Quiz[];
  submissions: QuizSubmission[];
  onClose: () => void;
}

type PeriodFilter = 'all' | '30' | '90';

interface QuestionInsight {
  quizTitle: string;
  category: string;
  question: QuizQuestion;
  questionNumber: number;
  attempts: number;
  rate: number;
}

interface CategoryPerformance {
  category: string;
  rate: number;
  responses: number;
}

const scoreOf = (submission: QuizSubmission): number => {
  const score = Number(submission.score_20);
  return Number.isFinite(score) ? Math.max(0, Math.min(20, score)) : 0;
};

const average = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const formatScore = (score: number | null): string => score === null ? '—' : `${score.toFixed(1)}/20`;

const formatPercent = (value: number | null): string => value === null ? '—' : `${Math.round(value)}%`;

const formatShortDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const questionInsights = (
  quizzes: Quiz[],
  submissions: QuizSubmission[],
  studentId?: string
): QuestionInsight[] => quizzes.flatMap(quiz => (quiz.questions || []).map((question, index) => {
  const attempts = submissions.filter(submission =>
    submission.quiz_id === quiz.id &&
    (!studentId || submission.student_id === studentId) &&
    Boolean(submission.feedback?.[question.id])
  );
  const possiblePoints = Math.max(1, Number(question.points) || 1);
  const earned = attempts.reduce((sum, submission) => {
    const points = Number(submission.feedback?.[question.id]?.points);
    return sum + (Number.isFinite(points) ? Math.max(0, points) : 0);
  }, 0);

  return {
    quizTitle: quiz.title,
    category: quiz.category || 'Autre',
    question,
    questionNumber: index + 1,
    attempts: attempts.length,
    rate: attempts.length ? Math.max(0, Math.min(100, (earned / (attempts.length * possiblePoints)) * 100)) : 0
  };
}));

const summarizeCategories = (insights: QuestionInsight[]): CategoryPerformance[] => {
  const grouped = new Map<string, { earnedPoints: number; possiblePoints: number; responses: number }>();
  insights.forEach(insight => {
    const group = grouped.get(insight.category) || { earnedPoints: 0, possiblePoints: 0, responses: 0 };
    const possiblePerResponse = Math.max(1, Number(insight.question.points) || 1);
    const possiblePoints = insight.attempts * possiblePerResponse;
    group.possiblePoints += possiblePoints;
    group.earnedPoints += possiblePoints * insight.rate / 100;
    group.responses += insight.attempts;
    grouped.set(insight.category, group);
  });
  return Array.from(grouped.entries()).map(([category, group]) => ({
    category,
    responses: group.responses,
    rate: group.possiblePoints ? (group.earnedPoints / group.possiblePoints) * 100 : 0
  })).sort((a, b) => a.rate - b.rate);
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
  const defaultClassId = classes.some(classroom => classroom.id === initialClassId)
    ? initialClassId
    : classes[0]?.id || '';
  const initialQuizBelongsToClass = quizzes.some(quiz => {
    const targetClassIds = quiz.class_ids?.length ? quiz.class_ids : [quiz.class_id];
    return quiz.id === initialQuizId && targetClassIds.includes(defaultClassId);
  });
  const [classId, setClassId] = useState(defaultClassId);
  const [studentId, setStudentId] = useState('');
  const [quizId, setQuizId] = useState(initialQuizBelongsToClass ? initialQuizId : 'all');
  const [period, setPeriod] = useState<PeriodFilter>('all');

  const classStudents = useMemo(
    () => students.filter(student => student.class_id === classId),
    [students, classId]
  );
  const classStudentIds = useMemo(() => new Set(classStudents.map(student => student.id)), [classStudents]);

  const classQuizzes = useMemo(() => quizzes.filter(quiz => {
    const targetClassIds = quiz.class_ids?.length ? quiz.class_ids : [quiz.class_id];
    if (!targetClassIds.includes(classId)) return false;
    if (period === 'all') return true;
    const referenceDate = new Date(quiz.launched_at || quiz.created_at).getTime();
    return Number.isFinite(referenceDate) && referenceDate >= Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  }), [quizzes, classId, period]);

  const visibleQuizzes = useMemo(
    () => classQuizzes.filter(quiz => quizId === 'all' ? quiz.status !== 'draft' : quiz.id === quizId),
    [classQuizzes, quizId]
  );

  const visibleQuizIds = useMemo(() => new Set(visibleQuizzes.map(quiz => quiz.id)), [visibleQuizzes]);

  const classSubmissions = useMemo(() => submissions.filter(submission =>
    submission.class_id === classId &&
    visibleQuizIds.has(submission.quiz_id) &&
    classStudentIds.has(submission.student_id)
  ), [submissions, classId, visibleQuizIds, classStudentIds]);

  const studentMetrics = useMemo(() => classStudents.map(student => {
    const learnerSubmissions = classSubmissions.filter(submission => submission.student_id === student.id);
    const learnerScores = learnerSubmissions.map(scoreOf);
    return {
      student,
      submissions: learnerSubmissions,
      average: average(learnerScores),
      successRate: learnerScores.length
        ? (learnerScores.filter(score => score >= 10).length / learnerScores.length) * 100
        : null
    };
  }).sort((left, right) => {
    if (left.average === null) return right.average === null ? left.student.last_name.localeCompare(right.student.last_name, 'fr') : -1;
    if (right.average === null) return 1;
    return left.average - right.average;
  }), [classStudents, classSubmissions]);

  const studentAverages = studentMetrics.flatMap(metric => metric.average === null ? [] : [metric.average]);
  const allScores = classSubmissions.map(scoreOf);
  const classAverage = average(studentAverages);
  const classMedian = median(studentAverages);
  const studentsWithResults = studentMetrics.filter(metric => metric.average !== null);
  const studentSuccessRate = studentsWithResults.length
    ? (studentsWithResults.filter(metric => (metric.average || 0) >= 10).length / studentsWithResults.length) * 100
    : null;
  const copySuccessRate = allScores.length
    ? (allScores.filter(score => score >= 10).length / allScores.length) * 100
    : null;
  const studentsToSupport = studentsWithResults.filter(metric => (metric.average || 0) < 10).length;

  const openedQuizzes = visibleQuizzes.filter(quiz => quiz.status === 'launched' || quiz.status === 'closed');
  const selectedLearnerIds = new Set((studentId ? classStudents.filter(student => student.id === studentId) : classStudents).map(student => student.id));
  const openedQuizIds = new Set(openedQuizzes.map(quiz => quiz.id));
  const expectedSubmissions = openedQuizIds.size * selectedLearnerIds.size;
  const returnedSubmissionKeys = new Set(
    classSubmissions
      .filter(submission => openedQuizIds.has(submission.quiz_id) && selectedLearnerIds.has(submission.student_id) && submission.status !== 'missed')
      .map(submission => `${submission.quiz_id}:${submission.student_id}`)
  );
  const returnedSubmissions = returnedSubmissionKeys.size;
  const participationRate = expectedSubmissions
    ? Math.min(100, (returnedSubmissions / expectedSubmissions) * 100)
    : null;

  const selectedStudent = classStudents.find(student => student.id === studentId);
  const selectedStudentMetric = studentMetrics.find(metric => metric.student.id === studentId);
  const selectedStudentAverage = selectedStudentMetric?.average ?? null;
  const selectedStudentSuccessRate = selectedStudentMetric?.successRate ?? null;
  const selectedStudentPassingCount = selectedStudentMetric?.submissions.filter(submission => scoreOf(submission) >= 10).length || 0;
  const classStandardDeviation = classAverage === null
    ? null
    : Math.sqrt(average(studentAverages.map(score => (score - classAverage) ** 2)) || 0);
  const classInsights = useMemo(
    () => questionInsights(visibleQuizzes, classSubmissions).filter(insight => insight.attempts > 0).sort((a, b) => a.rate - b.rate),
    [visibleQuizzes, classSubmissions]
  );
  const learnerInsights = useMemo(
    () => studentId
      ? questionInsights(visibleQuizzes, classSubmissions, studentId).filter(insight => insight.attempts > 0).sort((a, b) => a.rate - b.rate)
      : [],
    [visibleQuizzes, classSubmissions, studentId]
  );
  const classCategoryPerformance = useMemo(() => summarizeCategories(classInsights), [classInsights]);
  const learnerCategoryPerformance = useMemo(() => summarizeCategories(learnerInsights), [learnerInsights]);

  const trendPoints = useMemo(() => visibleQuizzes.map(quiz => {
    const assessmentSubmissions = classSubmissions.filter(submission => submission.quiz_id === quiz.id);
    const scoresByStudent = new Map<string, number[]>();
    assessmentSubmissions.forEach(submission => {
      const scores = scoresByStudent.get(submission.student_id) || [];
      scores.push(scoreOf(submission));
      scoresByStudent.set(submission.student_id, scores);
    });
    const classScore = average(Array.from(scoresByStudent.values()).map(scores => average(scores) || 0));
    const individualScore = studentId
      ? average(scoresByStudent.get(studentId) || [])
      : null;
    return { quiz, classScore, individualScore, date: quiz.launched_at || quiz.created_at || '' };
  }).filter(point => point.classScore !== null).sort((a, b) => a.date.localeCompare(b.date)).slice(-10), [visibleQuizzes, classSubmissions, studentId]);

  const distribution = [
    { label: '0–<5', min: 0, max: 5 },
    { label: '5–<10', min: 5, max: 10 },
    { label: '10–<12', min: 10, max: 12 },
    { label: '12–<14', min: 12, max: 14 },
    { label: '14–<16', min: 14, max: 16 },
    { label: '16–20', min: 16, max: 20.01 }
  ].map(bin => ({
    ...bin,
    count: studentAverages.filter(score => score >= bin.min && score < bin.max).length
  }));
  const maxDistributionCount = Math.max(1, ...distribution.map(bin => bin.count));

  const pointX = (index: number) => trendPoints.length <= 1 ? 300 : 42 + index * (516 / (trendPoints.length - 1));
  const pointY = (score: number) => 18 + ((20 - score) / 20) * 150;
  const classPath = trendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index)} ${pointY(point.classScore || 0)}`).join(' ');
  const studentTrendPoints = trendPoints.flatMap((point, index) => point.individualScore === null ? [] : [{ ...point, index }]);
  const studentPath = studentTrendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${pointX(point.index)} ${pointY(point.individualScore || 0)}`).join(' ');
  const classTrendDelta = trendPoints.length > 1
    ? (trendPoints[trendPoints.length - 1].classScore || 0) - (trendPoints[trendPoints.length - 2].classScore || 0)
    : null;
  const studentTrendDelta = studentTrendPoints.length > 1
    ? (studentTrendPoints[studentTrendPoints.length - 1].individualScore || 0) - (studentTrendPoints[studentTrendPoints.length - 2].individualScore || 0)
    : null;
  const noData = classSubmissions.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-analytics-title">
      <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-800"><BarChart3 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 id="quiz-analytics-title" className="font-display text-lg font-bold text-slate-900 sm:text-xl">Analyse pédagogique de la classe</h2>
              <p className="mt-0.5 text-xs text-slate-500">Des résultats contextualisés pour décider quoi renforcer et avec qui.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer le tableau de bord" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </header>

        <main className="space-y-5 overflow-y-auto p-4 sm:p-6">
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Filtres d’analyse">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Classe
              <select value={classId} onChange={event => { setClassId(event.target.value); setStudentId(''); setQuizId('all'); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500">
                {classes.map(classroom => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Élève (facultatif)
              <select value={studentId} onChange={event => setStudentId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500">
                <option value="">Toute la classe</option>
                {classStudents.map(student => <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Périmètre d’évaluation
              <select value={quizId} onChange={event => setQuizId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500">
                <option value="all">Tous les quiz de la classe</option>
                {classQuizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Période
              <select value={period} onChange={event => { setPeriod(event.target.value as PeriodFilter); setQuizId('all'); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500">
                <option value="all">Toutes les périodes</option>
                <option value="90">90 derniers jours</option>
                <option value="30">30 derniers jours</option>
              </select>
            </label>
          </section>
          <p className="-mt-3 px-1 text-[10px] leading-relaxed text-slate-400">La période sélectionne les quiz selon leur date de lancement (ou leur date de création si aucun lancement n’est enregistré); toutes les copies de ces quiz restent incluses.</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-700" /> Classe</span>
            {selectedStudent && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {selectedStudent.first_name} {selectedStudent.last_name}</span>}
            <span>Quiz inclus : {visibleQuizzes.length}</span>
            <span>Élèves inscrits : {classStudents.length}</span>
          </div>

              <section className="grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Indicateurs clés">
                <KpiCard label="Moyenne classe" value={formatScore(classAverage)} detail="Moyenne des moyennes par élève" tone="indigo" />
                <KpiCard label={selectedStudent ? 'Copies élève ≥ 10/20' : 'Élèves ≥ 10/20'} value={formatPercent(selectedStudent ? selectedStudentSuccessRate : studentSuccessRate)} detail={selectedStudent ? `${selectedStudentPassingCount} copie(s) réussie(s) sur ${selectedStudentMetric?.submissions.length || 0}` : `${studentsWithResults.filter(metric => (metric.average || 0) >= 10).length} élève(s) sur ${studentsWithResults.length}`} tone="emerald" />
                <KpiCard label="Participation estimée" value={formatPercent(participationRate)} detail={`${returnedSubmissions} rendu(s) / ${expectedSubmissions} attendu(s) · effectif actuel`} tone="blue" />
                <KpiCard label="Élèves à suivre" value={studentsWithResults.length ? `${studentsToSupport}` : '—'} detail={studentsWithResults.length ? `sur ${studentsWithResults.length} avec résultat · moyenne sous 10/20` : 'Aucun résultat à évaluer pour le moment'} tone="rose" />
                <KpiCard label={selectedStudent ? 'Moyenne de l’élève' : 'Médiane de classe'} value={formatScore(selectedStudent ? selectedStudentAverage : classMedian)} detail={selectedStudent && classAverage !== null && selectedStudentAverage !== null ? `${selectedStudentAverage - classAverage >= 0 ? '+' : ''}${(selectedStudentAverage - classAverage).toFixed(1)} pt vs classe` : 'Repère moins sensible aux notes extrêmes'} tone="amber" />
              </section>

              {noData && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><ClipboardList className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-3 text-sm font-bold text-slate-800">Pas encore de résultats sur ce périmètre</h3><p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">Les KPI de participation et de périmètre restent disponibles; les moyennes, tendances et notions s’afficheront dès les premières copies.</p></div>}

              {!noData && <>

              <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><TrendingUp className="h-4 w-4 text-indigo-700" /> Évolution des résultats</h3><p className="mt-1 text-[11px] text-slate-500">Moyenne des moyennes individuelles par quiz • 10/20 = seuil de réussite • 10 dernières évaluations max.</p></div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{trendPoints.length} évaluation(s)</span>{classTrendDelta !== null && <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${classTrendDelta >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>Δ classe {classTrendDelta >= 0 ? '+' : ''}{classTrendDelta.toFixed(1)} pt</span>}{studentTrendDelta !== null && selectedStudent && <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${studentTrendDelta >= 0 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'}`}>Δ élève {studentTrendDelta >= 0 ? '+' : ''}{studentTrendDelta.toFixed(1)} pt</span>}</div>
                  </div>
                  {trendPoints.length < 2 ? (
                    <div className="mt-5 rounded-lg bg-slate-50 p-5 text-center text-xs text-slate-500">Sélectionnez « Tous les quiz de la classe » et une période plus large pour voir une tendance, ou attendez une deuxième évaluation.</div>
                  ) : (
                    <div className="mt-4">
                      <svg viewBox="0 0 600 210" role="img" aria-label="Graphique d’évolution des moyennes aux évaluations" className="h-48 w-full overflow-visible">
                        {[0, 10, 20].map(value => <g key={value}><line x1="42" x2="558" y1={pointY(value)} y2={pointY(value)} stroke={value === 10 ? '#f59e0b' : '#e2e8f0'} strokeDasharray={value === 10 ? '5 5' : undefined} /><text x="4" y={pointY(value) + 4} fill="#64748b" fontSize="11">{value}/20</text></g>)}
                        <path d={classPath} fill="none" stroke="#3730a3" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                        {trendPoints.map((point, index) => <g key={point.quiz.id}><circle cx={pointX(index)} cy={pointY(point.classScore || 0)} r="4.5" fill="#3730a3"><title>{point.quiz.title} : {(point.classScore || 0).toFixed(1)}/20</title></circle><text x={pointX(index)} y="194" textAnchor="middle" fill="#64748b" fontSize="9">{formatShortDate(point.date)}</text></g>)}
                        {studentId && studentPath && <><path d={studentPath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 4" />{studentTrendPoints.map(point => <circle key={`student-${point.quiz.id}`} cx={pointX(point.index)} cy={pointY(point.individualScore || 0)} r="4" fill="#f59e0b"><title>{selectedStudent?.first_name} : {(point.individualScore || 0).toFixed(1)}/20</title></circle>)}</>}
                      </svg>
                      <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${trendPoints.length}, minmax(0, 1fr))` }}>
                        {trendPoints.map(point => <div key={`label-${point.quiz.id}`} title={point.quiz.title} className="truncate text-center text-[9px] text-slate-500">{point.quiz.title}</div>)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Users className="h-4 w-4 text-indigo-700" /> Distribution des moyennes par élève</h3><p className="mt-1 text-[11px] text-slate-500">Une moyenne par élève sur les évaluations sélectionnées.</p></div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-800">Médiane {formatScore(classMedian)}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">Écart-type {classStandardDeviation === null ? '—' : `${classStandardDeviation.toFixed(1)} pt`}</span></div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {distribution.map(bin => <div key={bin.label} className="grid grid-cols-[45px_1fr_34px] items-center gap-2 text-[11px]"><span className="text-slate-600">{bin.label}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${bin.min < 10 ? 'bg-rose-400' : bin.min < 14 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${bin.count / maxDistributionCount * 100}%` }} /></div><span className="text-right font-mono font-bold text-slate-700">{bin.count}</span></div>)}
                  </div>
                  <p className="mt-4 text-[10px] leading-relaxed text-slate-400">Les élèves sans copie ne figurent pas dans la distribution. Les copies « non rendues » comptabilisées à la clôture valent 0/20.</p>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <InsightPanel title="Notions à retravailler en classe" subtitle="Réussite calculée sur les points obtenus, y compris le crédit partiel; copies sans feedback exclues." insights={classInsights.slice(0, 5)} empty="Aucune réponse détaillée disponible sur cette sélection." />
                {selectedStudent ? <InsightPanel title={`Priorités pour ${selectedStudent.first_name}`} subtitle="Réussite individuelle par question, comparée à la classe dans le graphique ci-dessus." insights={learnerInsights.slice(0, 5)} empty="Aucune réponse détaillée disponible pour cet élève." /> : (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-950"><Lightbulb className="h-4 w-4" /> Lecture pédagogique</h3>
                    <ul className="mt-3 space-y-2 text-xs leading-relaxed text-indigo-950/80">
                      <li>• Commencez par les notions sous 60% de réussite; elles offrent le meilleur levier de remédiation.</li>
                      <li>• Vérifiez d’abord le nombre de réponses avant d’interpréter un taux : un faible effectif rend la tendance moins stable.</li>
                      <li>• Relancez une courte activité ciblée, puis comparez les résultats à la prochaine évaluation pour mesurer l’amélioration.</li>
                    </ul>
                  </div>
                )}
              </section>

              <CategoryPerformancePanel
                classPerformance={classCategoryPerformance}
                learnerPerformance={learnerCategoryPerformance}
                studentName={selectedStudent?.first_name}
              />

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
                  <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Target className="h-4 w-4 text-indigo-700" /> Résultats individuels</h3><p className="mt-0.5 text-[11px] text-slate-500">Cliquez sur un élève pour comparer son parcours à la classe.</p></div>
                  <span className="text-[11px] font-semibold text-slate-500">{studentMetrics.filter(metric => metric.average !== null).length} élève(s) avec résultat</span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Élève</th><th className="px-4 py-2.5">Moyenne</th><th className="px-4 py-2.5">Copies ≥ 10/20</th><th className="px-4 py-2.5">Quiz rendus</th><th className="px-4 py-2.5">Repère</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentMetrics.map(metric => <tr key={metric.student.id} className={`${studentId === metric.student.id ? 'bg-indigo-50' : ''} hover:bg-slate-50`}>
                        <td className="px-4 py-2.5"><button type="button" aria-pressed={studentId === metric.student.id} onClick={() => setStudentId(studentId === metric.student.id ? '' : metric.student.id)} className="rounded text-left font-bold text-slate-900 outline-none hover:text-indigo-800 focus:ring-2 focus:ring-indigo-500">{metric.student.first_name} {metric.student.last_name}</button></td>
                        <td className="px-4 py-2.5 font-mono font-bold">{formatScore(metric.average)}</td>
                        <td className="px-4 py-2.5">{metric.submissions.length ? `${metric.submissions.filter(submission => scoreOf(submission) >= 10).length} / ${metric.submissions.length}` : '—'}</td>
                        <td className="px-4 py-2.5">{new Set(metric.submissions.map(submission => submission.quiz_id)).size} / {visibleQuizzes.length}</td>
                        <td className="px-4 py-2.5">{metric.average === null ? <span className="text-slate-400">Aucun résultat</span> : metric.average < 10 ? <span className="inline-flex items-center gap-1 font-semibold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> À accompagner</span> : metric.average >= 14 ? <span className="font-semibold text-emerald-700">Maîtrise solide</span> : <span className="font-semibold text-amber-700">À consolider</span>}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </section>
              </>}

          <p className="text-[10px] leading-relaxed text-slate-400">Méthode : la cohorte affichée correspond aux élèves actuellement inscrits dans la classe; notes ramenées sur 20, moyenne et médiane calculées sur les moyennes individuelles des élèves ayant au moins un résultat. « Élèves ≥ 10/20 » donne le taux non pondéré par élève; la réussite par copie est {formatPercent(copySuccessRate)} ({allScores.filter(score => score >= 10).length}/{allScores.length}) à titre de repère. La participation estimée est dédupliquée par couple élève–quiz et utilise l’effectif actuel; elle porte uniquement sur les quiz lancés ou clôturés. La période s’applique à la date de lancement/création du quiz.</p>
        </main>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <span className="hidden text-[10px] text-slate-400 sm:block">Analyse pédagogique • Classe et élève</span>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">Fermer le tableau de bord</button>
        </footer>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{ label: string; value: string; detail: string; tone: 'indigo' | 'emerald' | 'blue' | 'rose' | 'amber' }> = ({ label, value, detail, tone }) => {
  const palette = {
    indigo: 'border-indigo-100 bg-indigo-50/60 text-indigo-800',
    emerald: 'border-emerald-100 bg-emerald-50/60 text-emerald-800',
    blue: 'border-blue-100 bg-blue-50/60 text-blue-800',
    rose: 'border-rose-100 bg-rose-50/60 text-rose-800',
    amber: 'border-amber-100 bg-amber-50/60 text-amber-800'
  }[tone];
  return <div className={`min-h-[112px] rounded-xl border p-3.5 ${palette}`}><div className="text-[10px] font-extrabold uppercase tracking-wide opacity-70">{label}</div><div className="mt-2 text-xl font-black font-mono sm:text-2xl">{value}</div><div className="mt-1 text-[10px] leading-snug text-slate-500">{detail}</div></div>;
};

const InsightPanel: React.FC<{ title: string; subtitle: string; insights: QuestionInsight[]; empty: string }> = ({ title, subtitle, insights, empty }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BookOpen className="h-4 w-4 text-indigo-700" /> {title}</h3>
    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{subtitle}</p>
    {insights.length === 0 ? <div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">{empty}</div> : <div className="mt-3 space-y-2.5">{insights.map(insight => <div key={`${insight.question.id}-${insight.quizTitle}`} className="rounded-lg border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-bold uppercase text-slate-400">{insight.quizTitle} · Question {insight.questionNumber}</div><p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-800">{insight.question.question}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${insight.rate < 60 ? 'bg-rose-100 text-rose-800' : insight.rate < 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{Math.round(insight.rate)}%</span></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>{insight.attempts} réponse(s) analysée(s) {insight.attempts < 5 && <strong className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Effectif faible</strong>}</span>{insight.question.explanation && <span className="truncate" title={insight.question.explanation}>Rappel : {insight.question.explanation}</span>}</div>
    </div>)}</div>}
  </div>
);


const CategoryPerformancePanel: React.FC<{
  classPerformance: CategoryPerformance[];
  learnerPerformance: CategoryPerformance[];
  studentName?: string;
}> = ({ classPerformance, learnerPerformance, studentName }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Analyse par catégorie de quiz">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Target className="h-4 w-4 text-indigo-700" /> Maîtrise par catégorie</h3>
        <p className="mt-1 text-[10px] text-slate-500">Réussite pondérée par les points possibles, avec crédit partiel et effectif de réponses visibles.</p>
      </div>
      {studentName && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">Comparaison avec {studentName}</span>}
    </div>
    {classPerformance.length === 0 ? (
      <div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">Aucun feedback de question disponible pour agréger les catégories.</div>
    ) : (
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {classPerformance.map(category => {
          const learner = learnerPerformance.find(item => item.category === category.category);
          const fillColor = category.rate < 60 ? 'bg-rose-500' : category.rate < 80 ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <div key={category.category} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">{category.category}</span>
                <span className="shrink-0 text-[10px] font-extrabold text-slate-700">{Math.round(category.rate)}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`Réussite classe en ${category.category}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(category.rate)}>
                <div className={`h-full rounded-full ${fillColor}`} style={{ width: `${category.rate}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>{category.responses} réponse(s) question · classe{category.responses < 5 && <strong className="ml-1 text-amber-700">effectif faible</strong>}</span>
                {studentName && <span>{learner ? `${Math.round(learner.rate)}% · ${learner.responses} réponse(s) élève` : 'Aucune réponse de l’élève'}</span>}
              </div>
            </div>
          );
        })}
      </div>
    )}
    <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Action suggérée : cibler d’abord la catégorie la plus faible, puis proposer une activité courte de remédiation et comparer la prochaine évaluation.</p>
  </section>
);
