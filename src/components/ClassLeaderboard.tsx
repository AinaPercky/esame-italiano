import React, { useState, useMemo } from 'react';
import { Trophy, Medal, Award, TrendingUp, Calendar, Users, Flame, Star, Sparkles, Filter } from 'lucide-react';
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Header bar */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-900 via-amber-950 to-slate-900 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-inner">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-lg sm:text-xl text-white">
                  {effectiveQuizId
                    ? 'Classement du Quiz'
                    : (isStudentView || selectedDate === ALL_DATES)
                      ? 'Classement Cumulé — Tous les Quiz'
                      : 'Classement Journalier Cumulé'}
                </h3>
                {isToday && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 animate-pulse">
                    EN DIRECT
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                {effectiveQuizId
                  ? 'Classement des élèves selon leur note à ce quiz.'
                  : 'Classement basé sur le total des points obtenus par rapport aux points possibles.'}
              </p>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {classAverage !== null && (
              <div className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/15 text-center">
                <div className="text-[10px] uppercase font-bold text-amber-300">Moyenne Classe</div>
                <div className="font-mono font-extrabold text-sm text-white">{classAverage}/20</div>
              </div>
            )}
            {topScore !== null && (
              <div className="px-3 py-1.5 bg-amber-400/20 backdrop-blur-md rounded-xl border border-amber-400/30 text-center">
                <div className="text-[10px] uppercase font-bold text-amber-300">Meilleure Note</div>
                <div className="font-mono font-extrabold text-sm text-amber-300">{topScore}/20</div>
              </div>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Class selector */}
          {!isStudentView && classes.length > 0 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block mb-1">
                Classe
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedQuizId('');
                }}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:bg-slate-900 cursor-pointer"
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block mb-1">
                Période
              </label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-300 shrink-0" />
                <select
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedQuizId('');
                  }}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:bg-slate-900 cursor-pointer"
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block mb-1">
              Classement à afficher
            </label>
            <select
              value={effectiveQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:bg-slate-900 cursor-pointer"
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

      {/* Podium Top 3 (if at least 1 student graded) */}
      {leaderboardEntries.graded.length > 0 && (
        <div className="p-5 bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 text-center sm:text-left flex items-center justify-center sm:justify-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{effectiveQuizId ? 'Podium du quiz' : (isStudentView || selectedDate === ALL_DATES) ? 'Podium Général' : 'Podium de la journée'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1st Place */}
            {leaderboardEntries.graded[0] && (
              <div className={`p-4 rounded-2xl border transition-all ${
                currentStudentId === leaderboardEntries.graded[0].student_id
                  ? 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-400'
                  : 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-300 shadow-xs'
              } flex items-center gap-3 order-1 sm:order-2 sm:scale-105`}>
                <div className="w-12 h-12 rounded-2xl bg-amber-400 text-amber-950 font-extrabold text-xl flex items-center justify-center shrink-0 shadow-sm border-2 border-white">
                  🥇
                </div>
                <StudentAvatar
                  name={leaderboardEntries.graded[0].student_name}
                  src={getStudent(
                    leaderboardEntries.graded[0].student_id,
                    leaderboardEntries.graded[0].class_id,
                    leaderboardEntries.graded[0].student_number,
                    leaderboardEntries.graded[0].student_name
                  )?.avatar_url || undefined}
                  className="w-10 h-10 border-2 border-white text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                      1er Rang
                    </span>
                    {currentStudentId === leaderboardEntries.graded[0].student_id && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-800 text-white">
                        VOUS
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900 text-sm truncate mt-0.5">
                    {leaderboardEntries.graded[0].student_name}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {leaderboardEntries.graded[0].quizzes_count} quiz passé(s)
                  </div>
                </div>
                <div className="font-mono font-black text-lg text-amber-900">
                  {leaderboardEntries.graded[0].average_score_20}<span className="text-xs text-amber-700 font-normal">/20</span>
                </div>
              </div>
            )}

            {/* 2nd Place */}
            {leaderboardEntries.graded[1] && (
              <div className={`p-3.5 rounded-2xl border transition-all ${
                currentStudentId === leaderboardEntries.graded[1].student_id
                  ? 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-400'
                  : 'bg-gradient-to-br from-slate-50 to-slate-100/60 border-slate-300'
              } flex items-center gap-3 order-2 sm:order-1`}>
                <div className="w-10 h-10 rounded-2xl bg-slate-200 text-slate-700 font-extrabold text-lg flex items-center justify-center shrink-0 border-2 border-white">
                  🥈
                </div>
                <StudentAvatar
                  name={leaderboardEntries.graded[1].student_name}
                  src={getStudent(
                    leaderboardEntries.graded[1].student_id,
                    leaderboardEntries.graded[1].class_id,
                    leaderboardEntries.graded[1].student_number,
                    leaderboardEntries.graded[1].student_name
                  )?.avatar_url || undefined}
                  className="w-9 h-9 border-2 border-white text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                      2e Rang
                    </span>
                    {currentStudentId === leaderboardEntries.graded[1].student_id && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-800 text-white">
                        VOUS
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900 text-xs sm:text-sm truncate mt-0.5">
                    {leaderboardEntries.graded[1].student_name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {leaderboardEntries.graded[1].quizzes_count} quiz
                  </div>
                </div>
                <div className="font-mono font-extrabold text-base text-slate-800">
                  {leaderboardEntries.graded[1].average_score_20}<span className="text-[11px] text-slate-500 font-normal">/20</span>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {leaderboardEntries.graded[2] && (
              <div className={`p-3.5 rounded-2xl border transition-all ${
                currentStudentId === leaderboardEntries.graded[2].student_id
                  ? 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-400'
                  : 'bg-gradient-to-br from-orange-50 to-amber-50/50 border-orange-200'
              } flex items-center gap-3 order-3 sm:order-3`}>
                <div className="w-10 h-10 rounded-2xl bg-orange-200 text-orange-900 font-extrabold text-lg flex items-center justify-center shrink-0 border-2 border-white">
                  🥉
                </div>
                <StudentAvatar
                  name={leaderboardEntries.graded[2].student_name}
                  src={getStudent(
                    leaderboardEntries.graded[2].student_id,
                    leaderboardEntries.graded[2].class_id,
                    leaderboardEntries.graded[2].student_number,
                    leaderboardEntries.graded[2].student_name
                  )?.avatar_url || undefined}
                  className="w-9 h-9 border-2 border-white text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-orange-900">
                      3e Rang
                    </span>
                    {currentStudentId === leaderboardEntries.graded[2].student_id && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-800 text-white">
                        VOUS
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900 text-xs sm:text-sm truncate mt-0.5">
                    {leaderboardEntries.graded[2].student_name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {leaderboardEntries.graded[2].quizzes_count} quiz
                  </div>
                </div>
                <div className="font-mono font-extrabold text-base text-orange-950">
                  {leaderboardEntries.graded[2].average_score_20}<span className="text-[11px] text-orange-700 font-normal">/20</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <span>
              {effectiveQuizId ? 'Classement du quiz' : (isStudentView || selectedDate === ALL_DATES) ? 'Classement général — Tous les quiz' : 'Classement général de la journée'}
              {' '}({leaderboardEntries.graded.length} élève(s) classé(s))
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {(isStudentView || selectedDate === ALL_DATES) ? 'Toutes les dates' : selectedDate}
          </span>
        </div>

        {leaderboardEntries.graded.length === 0 && leaderboardEntries.pending.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Aucun élève ni quiz enregistré pour cette période.
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Graded Students */}
            {leaderboardEntries.graded.map((dg, index) => {
              const rank = index + 1;
              const isCurrentUser = currentStudentId === dg.student_id;
              
              let rankBadge = (
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                  {rank}
                </span>
              );

              if (rank === 1) {
                rankBadge = <span className="text-base shrink-0">🥇</span>;
              } else if (rank === 2) {
                rankBadge = <span className="text-base shrink-0">🥈</span>;
              } else if (rank === 3) {
                rankBadge = <span className="text-base shrink-0">🥉</span>;
              }

              return (
                <div
                  key={`${dg.student_id}_${dg.date}`}
                  className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 text-xs sm:text-sm ${
                    isCurrentUser
                      ? 'bg-amber-500/10 border-amber-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {rankBadge}
                    <StudentAvatar
                      name={dg.student_name}
                      src={getStudent(dg.student_id, dg.class_id, dg.student_number, dg.student_name)?.avatar_url || undefined}
                      className="w-9 h-9 border border-slate-200 text-[10px]"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 truncate">
                          {dg.student_name}
                        </span>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-800 text-white shrink-0">
                            VOUS
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        N° {dg.student_number || '1'} •                         {dg.quizzes_count} quiz pris en compte
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs sm:text-sm ${
                      dg.average_score_20 >= 16
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : dg.average_score_20 >= 12
                          ? 'bg-blue-100 text-blue-900 border border-blue-300'
                          : dg.average_score_20 >= 10
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}>
                      {dg.average_score_20} / 20
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Pending Students (haven't submitted today) */}
            {leaderboardEntries.pending.length > 0 && (
              <div className="pt-3 mt-3 border-t border-slate-200">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  En attente de participation ({leaderboardEntries.pending.length})
                </div>
                <div className="space-y-1.5 opacity-65">
                  {leaderboardEntries.pending.map((pen) => {
                    const isCurrentUser = currentStudentId === pen.student_id;
                    return (
                      <div
                        key={pen.student_id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          isCurrentUser
                            ? 'bg-amber-50 border-amber-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-400 font-mono text-[10px] flex items-center justify-center">
                            -
                          </span>
                          <StudentAvatar
                            name={pen.student_name}
                            src={getStudent(pen.student_id, pen.class_id, pen.student_number, pen.student_name)?.avatar_url || undefined}
                            className="w-8 h-8 border border-slate-200 text-[9px]"
                          />
                          <span className="font-medium text-slate-700 truncate">
                            {pen.student_name}
                          </span>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-800 text-white shrink-0">
                              VOUS
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 italic">
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
