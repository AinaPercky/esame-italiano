import React, { useState, useMemo } from 'react';
import { Trophy, Calendar, Users, Crown, Medal } from 'lucide-react';
import { DailyGrade, ClassRoom, Student } from '../types';
import { StudentAvatar } from './StudentAvatar';

const ALL_DATES = 'all';

function studentIdentityKey(student: Pick<Student, 'id'>): string {
  return student.id;
}

function gradeIdentityKey(grade: DailyGrade, students: Student[]): string {
  return students.find(student => student.id === grade.student_id)?.id || grade.student_id;
}

interface ClassLeaderboardProps {
  dailyGrades: DailyGrade[];
  classes: ClassRoom[];
  students?: Student[];
  currentStudentId?: string; // Surligner l'élève connecté s'il est dans la classe
  initialClassId?: string;
  isStudentView?: boolean;
}

export const ClassLeaderboard: React.FC<ClassLeaderboardProps> = ({
  dailyGrades,
  classes,
  students = [],
  currentStudentId,
  initialClassId,
  isStudentView = false
}) => {
  // Liste des dates uniques disponibles pour les notes
  const availableDates = useMemo(() => {
    const dates = Array.from(new Set(dailyGrades.map(dg => dg.date)));
    const today = new Date().toISOString().split('T')[0];
    if (!dates.includes(today)) {
      dates.unshift(today);
    }
    return dates.sort((a, b) => b.localeCompare(a));
  }, [dailyGrades]);

  // En vue étudiant : toujours afficher toutes les dates (cumul global, sans filtre de période)
  const [selectedDate, setSelectedDate] = useState<string>(
    isStudentView ? ALL_DATES : (availableDates[0] || new Date().toISOString().split('T')[0])
  );

  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialClassId || classes[0]?.id || ''
  );

  const availableQuizzes = useMemo(() => {
    const quizzesById = new Map<string, string>();
    dailyGrades
      .filter(grade =>
        (selectedDate === ALL_DATES || grade.date === selectedDate) &&
        (!selectedClassId || grade.class_id === selectedClassId)
      )
      .flatMap(grade => grade.submissions)
      .forEach(submission => quizzesById.set(submission.quiz_id, submission.quiz_title));
    return Array.from(quizzesById, ([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [dailyGrades, selectedClassId, selectedDate]);

  const effectiveQuizId = availableQuizzes.some(quiz => quiz.id === selectedQuizId)
    ? selectedQuizId
    : '';

  // Filtrer les dailyGrades pour la classe et la date sélectionnées
  const filteredGrades = useMemo(() => {
    const submissionsByStudent = new Map<string, DailyGrade['submissions']>();
    dailyGrades
      .filter(grade =>
        (!selectedClassId || grade.class_id === selectedClassId) &&
        (selectedDate === ALL_DATES || grade.date === selectedDate)
      )
      .flatMap(grade => grade.submissions)
      .filter(submission => !effectiveQuizId || submission.quiz_id === effectiveQuizId)
      .forEach(submission => {
        const key = `${submission.class_id}_${submission.student_id}`;
        const submissions = submissionsByStudent.get(key) || [];
        submissions.push(submission);
        submissionsByStudent.set(key, submissions);
      });

    return Array.from(submissionsByStudent.values()).map(submissions => {
      const first = submissions[0];
      const totalScore = submissions.reduce((sum, submission) => sum + submission.score, 0);
      const totalPossible = submissions.reduce((sum, submission) => sum + submission.max_score, 0);

      return {
        student_id: first.student_id,
        student_name: first.student_name,
        student_number: first.student_number,
        class_id: first.class_id,
        class_name: first.class_name,
        date: selectedDate,
        quizzes_count: submissions.length,
        average_score_20: totalPossible > 0
          ? Number(((totalScore / totalPossible) * 20).toFixed(2))
          : 0,
        submissions
      };
    });
  }, [dailyGrades, selectedClassId, selectedDate, effectiveQuizId]);

  // Si on est dans une classe spécifique, on peut aussi lister les élèves qui n'ont pas encore de note aujourd'hui
  const activeClass = classes.find(c => c.id === selectedClassId);
  const classStudents = useMemo(() => {
    if (!selectedClassId) return students;
    return students.filter(s => s.class_id === selectedClassId);
  }, [students, selectedClassId]);
  const getStudent = (studentId: string, _classId: string, _studentNumber?: string | null, _studentName?: string) => {
    return students.find(student => student.id === studentId);
  };

  // Construire le classement ordonné par note décroissante
  const leaderboardEntries = useMemo(() => {
    const gradesByIdentity = new Map<string, DailyGrade>();
    filteredGrades.forEach(grade => {
      const key = gradeIdentityKey(grade, students);
      const current = gradesByIdentity.get(key);
      const gradeHasSubmission = grade.submissions.some(submission => submission.status !== 'missed');
      const currentHasSubmission = current?.submissions.some(submission => submission.status !== 'missed') || false;
      const isCurrentStudent = grade.student_id === currentStudentId;
      const currentIsCurrentStudent = current?.student_id === currentStudentId;

      if (
        !current ||
        (isCurrentStudent && !currentIsCurrentStudent) ||
        (isCurrentStudent === currentIsCurrentStudent && gradeHasSubmission && !currentHasSubmission) ||
        (isCurrentStudent === currentIsCurrentStudent && gradeHasSubmission === currentHasSubmission &&
          (grade.quizzes_count > current.quizzes_count ||
            (grade.quizzes_count === current.quizzes_count && grade.average_score_20 > current.average_score_20)))
      ) {
        gradesByIdentity.set(key, grade);
      }
    });
    const uniqueGrades = Array.from(gradesByIdentity.values());
    const gradedIdentityKeys = new Set(gradesByIdentity.keys());

    // Entrées notées triées par note
    const gradedList = [...uniqueGrades].sort((a, b) => {
      if (b.average_score_20 !== a.average_score_20) {
        return b.average_score_20 - a.average_score_20;
      }
      return b.quizzes_count - a.quizzes_count;
    });

    // Entrées pour les élèves de la classe qui n'ont pas encore composé
    const unrankedList: Array<{
      student_id: string;
      student_name: string;
      student_number?: string | null;
      class_id: string;
      class_name?: string;
      date: string;
      quizzes_count: number;
      average_score_20: number | null;
      isPending: boolean;
    }> = [];

    const uniqueClassStudents = new Map<string, Student>();
    classStudents.forEach(student => {
      const key = studentIdentityKey(student);
      const existing = uniqueClassStudents.get(key);
      if (!existing || (!existing.avatar_url && student.avatar_url)) {
        uniqueClassStudents.set(key, student);
      }
    });

    uniqueClassStudents.forEach((st, identityKey) => {
      if (!gradedIdentityKeys.has(identityKey)) {
        unrankedList.push({
          student_id: st.id,
          student_name: `${st.first_name} ${st.last_name}`,
          student_number: st.student_number,
          class_id: st.class_id,
          class_name: activeClass?.name,
          date: selectedDate,
          quizzes_count: 0,
          average_score_20: null,
          isPending: true
        });
      }
    });

    return {
      graded: gradedList,
      pending: unrankedList
    };
  }, [filteredGrades, classStudents, selectedDate, activeClass, students, currentStudentId]);

  const classAverage = useMemo(() => {
    if (leaderboardEntries.graded.length === 0) return null;
    const sum = leaderboardEntries.graded.reduce((acc, curr) => acc + curr.average_score_20, 0);
    return Number((sum / leaderboardEntries.graded.length).toFixed(1));
  }, [leaderboardEntries.graded]);

  const topScore = leaderboardEntries.graded[0]?.average_score_20 ?? null;

  const todayFormatted = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayFormatted;

  return (
    <div className="min-w-0 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(7,42,63,0.08)]">
      {/* Header bar */}
      <div className="relative isolate overflow-hidden bg-gradient-to-br from-[#072A3F] via-[#0B3C5D] to-[#072A3F] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/[0.08]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-5 -top-14 h-40 w-40 rounded-full border border-emerald-300/[0.12]" />
        <div className="relative z-10 p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#74D3A1] shadow-inner">
                <Trophy className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/60">PerckyLingua · Classement</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold leading-tight text-white sm:text-xl">
                    {effectiveQuizId
                      ? 'Classement du Quiz'
                      : (isStudentView || selectedDate === ALL_DATES)
                        ? 'Classement Cumulé — Tous les Quiz'
                        : 'Classement Journalier Cumulé'}
                  </h3>
                  {isToday && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#2FA36B]" /> EN DIRECT
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#D5E7F1]/80">
                  {effectiveQuizId
                    ? 'Classement des élèves selon leur note à ce quiz.'
                    : 'Classement basé sur le total des points obtenus par rapport aux points possibles.'}
                </p>
              </div>
            </div>

          {/* Quick Stats Badges */}
          <div className="flex flex-wrap items-stretch gap-2 self-start sm:self-auto">
            {classAverage !== null && (
              <div className="min-w-[112px] flex-1 rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-center backdrop-blur-md sm:flex-initial">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#B9D3E2]">Moyenne de classe</div>
                <div className="font-mono text-sm font-extrabold text-white">{classAverage}<span className="text-white/60">/20</span></div>
              </div>
            )}
            {topScore !== null && (
              <div className="min-w-[112px] flex-1 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.10] px-3 py-2 text-center backdrop-blur-md sm:flex-initial">
                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-100/80">Meilleure note</div>
                <div className="font-mono text-sm font-extrabold text-[#9DE2B8]">{topScore}<span className="text-emerald-100/60">/20</span></div>
              </div>
            )}
          </div>
          </div>

        {/* Filter Controls */}
        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
          {/* Class selector */}
          {!isStudentView && classes.length > 0 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block mb-1">
                Classe
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedQuizId('');
                }}
                className="w-full min-w-0 max-w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:bg-slate-900 cursor-pointer"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date selector — masqué en vue étudiant (cumul global forcé) */}
          {!isStudentView && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block mb-1">
                Période
              </label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-300 shrink-0" />
                <select
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedQuizId('');
                  }}
                  className="w-full min-w-0 max-w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:bg-slate-900 cursor-pointer"
                >
                  <option value={ALL_DATES} className="bg-slate-900 text-white">
                    Toutes les dates
                  </option>
                  {availableDates.map(d => (
                    <option key={d} value={d} className="bg-slate-900 text-white">
                      {d === todayFormatted ? `Aujourd'hui (${d})` : d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className={isStudentView ? 'sm:col-span-2' : ''}>
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block mb-1">
              Classement à afficher
            </label>
            <select
              value={effectiveQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
              className="w-full min-w-0 max-w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:bg-slate-900 cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">
                Cumul de tous les quiz
              </option>
              {availableQuizzes.map(quiz => (
                <option key={quiz.id} value={quiz.id} className="bg-slate-900 text-white">
                  {quiz.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        </div>
      </div>

      {/* Podium Top 3 (if at least 1 student graded) */}
      {leaderboardEntries.graded.length > 0 && (
        <div className="p-5 bg-[#F5F9FC] border-b border-slate-200">
          <div className="mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-left">
            <span>{effectiveQuizId ? 'Podium du quiz' : (isStudentView || selectedDate === ALL_DATES) ? 'Podium Général' : 'Podium de la journée'}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* 1st Place */}
            {leaderboardEntries.graded[0] && (
              <div className={`rounded-2xl border p-3 transition-all sm:p-4 ${
                currentStudentId === leaderboardEntries.graded[0].student_id
                  ? 'shadow-md ring-2 ring-[#0B3C5D]/20'
                  : 'shadow-sm'
              } flex min-w-0 items-center gap-2 order-1 border-[#87C99D] bg-gradient-to-br from-[#EAF8F0] via-[#D4EFDE] to-[#9DDAAF] sm:gap-3 xl:order-2 xl:-translate-y-1`}>
                <div aria-label="Premier rang" role="img" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border-2 border-white bg-[#2FA36B] text-white shadow-sm">
                  <Crown className="h-5 w-5" aria-hidden="true" />
                </div>
                <StudentAvatar
                  name={leaderboardEntries.graded[0].student_name}
                  src={getStudent(
                    leaderboardEntries.graded[0].student_id,
                    leaderboardEntries.graded[0].class_id,
                    leaderboardEntries.graded[0].student_number,
                    leaderboardEntries.graded[0].student_name
                  )?.avatar_url || undefined}
                  className="w-11 h-11 border-2 border-white text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="hidden rounded-full bg-[#DDF2E6] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#176B45] sm:inline-flex">
                      1er Rang
                    </span>
                    {currentStudentId === leaderboardEntries.graded[0].student_id && (
                      <span className="rounded-full bg-[#0B3C5D] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                      VOUS
                    </span>
                  )}
                  </div>
                  <div className="mt-0.5 break-words text-xs font-bold leading-tight text-[#072A3F] sm:text-sm">
                    {leaderboardEntries.graded[0].student_name}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {leaderboardEntries.graded[0].quizzes_count} quiz passé(s)
                  </div>
                </div>
                <div className="shrink-0 rounded-xl border border-[#D8E9DF] bg-white/85 px-2 py-1 font-mono text-sm font-black text-[#176B45] sm:px-2.5 sm:py-1.5 sm:text-base">
                  {leaderboardEntries.graded[0].average_score_20}<span className="text-[10px] font-semibold text-slate-500">/20</span>
                </div>
              </div>
            )}

            {/* 2nd Place */}
            {leaderboardEntries.graded[1] && (
              <div className={`rounded-2xl border p-3 transition-all sm:p-3.5 ${
                currentStudentId === leaderboardEntries.graded[1].student_id
                  ? 'shadow-md ring-2 ring-[#0B3C5D]/20'
                  : 'shadow-sm'
              } flex min-w-0 items-center gap-2 order-2 border-[#8DB6CC] bg-gradient-to-br from-[#EDF6FB] via-[#CFE3F0] to-[#A7C9DD] sm:gap-3 xl:order-1`}>
                <div aria-label="Deuxième rang" role="img" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white bg-[#0B3C5D] text-white shadow-sm">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </div>
                <StudentAvatar
                  name={leaderboardEntries.graded[1].student_name}
                  src={getStudent(
                    leaderboardEntries.graded[1].student_id,
                    leaderboardEntries.graded[1].class_id,
                    leaderboardEntries.graded[1].student_number,
                    leaderboardEntries.graded[1].student_name
                  )?.avatar_url || undefined}
                  className="w-10 h-10 border-2 border-white text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="hidden rounded-full bg-[#E6F0F7] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#0B3C5D] sm:inline-flex">
                      2e Rang
                    </span>
                    {currentStudentId === leaderboardEntries.graded[1].student_id && (
                      <span className="rounded-full bg-[#0B3C5D] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                      VOUS
                    </span>
                  )}
                  </div>
                  <div className="mt-0.5 break-words text-xs font-bold leading-tight text-[#072A3F] sm:text-sm">
                    {leaderboardEntries.graded[1].student_name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {leaderboardEntries.graded[1].quizzes_count} quiz
                  </div>
                </div>
                <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-extrabold text-[#0B3C5D] sm:px-2.5 sm:py-1.5 sm:text-sm">
                  {leaderboardEntries.graded[1].average_score_20}<span className="text-[10px] font-semibold text-slate-500">/20</span>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {leaderboardEntries.graded[2] && (
              <div className={`rounded-2xl border p-3 transition-all sm:p-3.5 ${
                currentStudentId === leaderboardEntries.graded[2].student_id
                  ? 'shadow-md ring-2 ring-[#0B3C5D]/20'
                  : 'shadow-sm'
              } flex min-w-0 items-center gap-2 order-3 border-[#E4C358] bg-gradient-to-br from-[#FFFCF0] via-[#FFF0BE] to-[#F5D76F] sm:gap-3`}>
                <div aria-label="Troisième rang" role="img" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white bg-[#F2C94C] text-[#072A3F] shadow-sm">
                  <Medal className="h-5 w-5" aria-hidden="true" />
                </div>
                <StudentAvatar
                  name={leaderboardEntries.graded[2].student_name}
                  src={getStudent(
                    leaderboardEntries.graded[2].student_id,
                    leaderboardEntries.graded[2].class_id,
                    leaderboardEntries.graded[2].student_number,
                    leaderboardEntries.graded[2].student_name
                  )?.avatar_url || undefined}
                  className="w-10 h-10 border-2 border-white text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-700 sm:inline-flex">
                      3e Rang
                    </span>
                    {currentStudentId === leaderboardEntries.graded[2].student_id && (
                      <span className="rounded-full bg-[#0B3C5D] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                      VOUS
                    </span>
                  )}
                  </div>
                  <div className="mt-0.5 break-words text-xs font-bold leading-tight text-[#072A3F] sm:text-sm">
                    {leaderboardEntries.graded[2].student_name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {leaderboardEntries.graded[2].quizzes_count} quiz
                  </div>
                </div>
                <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-extrabold text-[#315267] sm:px-2.5 sm:py-1.5 sm:text-sm">
                  {leaderboardEntries.graded[2].average_score_20}<span className="text-[10px] font-semibold text-slate-500">/20</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 text-sm font-bold text-[#072A3F]">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3C5D]" />
            <span className="min-w-0 leading-snug">
              {effectiveQuizId ? 'Classement du quiz' : (isStudentView || selectedDate === ALL_DATES) ? 'Classement général — Tous les quiz' : 'Classement général de la journée'}
              {' '}({leaderboardEntries.graded.length} élève(s) classé(s))
            </span>
          </div>
          <span className="rounded-full bg-[#E6F0F7] px-2.5 py-1 text-[10px] font-semibold text-[#0B3C5D]">
            {(isStudentView || selectedDate === ALL_DATES) ? 'Toutes les dates' : selectedDate}
          </span>
        </div>

        {leaderboardEntries.graded.length === 0 && leaderboardEntries.pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F7FAFC] px-5 py-10 text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[#E6F0F7] text-[#0B3C5D]">
              <Trophy className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-[#072A3F]">Le classement apparaîtra ici</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Aucun élève ni quiz enregistré pour cette période.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Graded Students */}
            {leaderboardEntries.graded.map((dg, index) => {
              const rank = index + 1;
              const isCurrentUser = currentStudentId === dg.student_id;
              
              const rankBadge = (
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-extrabold ${
                  rank === 1
                    ? 'bg-[#DDF2E6] text-[#176B45]'
                    : rank === 2
                      ? 'bg-[#E6F0F7] text-[#0B3C5D]'
                      : rank === 3
                        ? 'bg-[#FFF2C6] text-[#8A6500]'
                      : 'bg-slate-100 text-slate-600'
                }`}>
                  {rank === 1
                    ? <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                    : rank === 2
                      ? <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                      : rank === 3
                        ? <Medal className="h-3.5 w-3.5" aria-hidden="true" />
                        : rank}
                </span>
              );

              return (
                <div
                  key={`${dg.student_id}_${dg.date}`}
                  className={`flex min-w-0 items-center justify-between gap-2 rounded-2xl border p-3 text-xs transition-all sm:gap-3 sm:p-3.5 sm:text-sm ${
                    isCurrentUser
                      ? 'border-[#8EB7CE] bg-[#F0F7FB] shadow-sm ring-1 ring-[#0B3C5D]/5'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-xs'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                    {rankBadge}
                    <StudentAvatar
                      name={dg.student_name}
                      src={getStudent(dg.student_id, dg.class_id, dg.student_number, dg.student_name)?.avatar_url || undefined}
                      className="w-10 h-10 border border-slate-200 text-[10px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold text-[#072A3F]">
                          {dg.student_name}
                        </span>
                        {isCurrentUser && (
                          <span className="shrink-0 rounded-full bg-[#0B3C5D] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                            VOUS
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500 sm:text-[11px]">
                        {dg.student_number ? `N° ${dg.student_number} · ` : ''}{dg.quizzes_count} quiz pris en compte
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center">
                    <span className={`whitespace-nowrap rounded-xl border px-2.5 py-1.5 font-mono text-xs font-extrabold sm:text-sm ${
                      dg.average_score_20 >= 16
                        ? 'bg-[#E8F5EE] text-[#176B45] border-[#B7E2CA]'
                        : dg.average_score_20 >= 12
                          ? 'bg-[#E6F0F7] text-[#0B3C5D] border-[#C7DCEB]'
                          : dg.average_score_20 >= 10
                            ? 'bg-[#E6F0F7] text-[#0B3C5D] border-[#C7DCEB]'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}>
                      {dg.average_score_20}<span className="ml-0.5 text-[9px] font-semibold opacity-65">/20</span>
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Pending Students (haven't submitted today) */}
            {leaderboardEntries.pending.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">En attente de participation</span>
                  <span className="rounded-full bg-[#E6F0F7] px-2 py-0.5 text-[10px] font-bold text-[#0B3C5D]">{leaderboardEntries.pending.length}</span>
                </div>
                <div className="space-y-2">
                  {leaderboardEntries.pending.map((pen) => {
                    const isCurrentUser = currentStudentId === pen.student_id;
                    return (
                      <div
                        key={pen.student_id}
                        className={`flex min-w-0 flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-xs sm:flex-row sm:items-center ${
                          isCurrentUser
                            ? 'border-[#C7DCEB] bg-[#F4F8FB]'
                            : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-400 ring-1 ring-slate-200">
                            ···
                          </span>
                          <StudentAvatar
                            name={pen.student_name}
                            src={getStudent(pen.student_id, pen.class_id, pen.student_number, pen.student_name)?.avatar_url || undefined}
                            className="w-9 h-9 border border-slate-200 text-[9px]"
                          />
                          <span className="truncate font-semibold text-slate-700">
                            {pen.student_name}
                          </span>
                          {isCurrentUser && (
                            <span className="shrink-0 rounded-full bg-[#0B3C5D] px-1.5 py-0.5 text-[9px] font-bold text-white">
                              VOUS
                            </span>
                          )}
                        </div>
                        <span className="pl-9 text-[11px] text-slate-500 sm:pl-0">
                          Pas encore de note
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
