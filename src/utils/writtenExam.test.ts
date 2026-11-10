import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A1_TEMPLATE, L135_TEMPLATE, createQuestion, createSection, getWrittenExamTotals, validateWrittenExam, applyWrittenExamOrder, getWrittenQuestionTimeLimit, getTimedQuestionIndex, getTimedQuestionRemainingSeconds, formatWrittenExamTimeSaveError, shouldDisqualifyWrittenExamVisibilityChange } from './writtenExam';

test('L135 model starts with a 90-point configurable allocation and 105-minute duration',()=>{
 assert.equal(L135_TEMPLATE.sections.reduce((n,s)=>n+s.points,0),90);
 assert.equal(getWrittenExamTotals(L135_TEMPLATE).raw,90);
 assert.equal(L135_TEMPLATE.duration_minutes,105);
 assert.equal(L135_TEMPLATE.display_scale,100);
 assert.equal(L135_TEMPLATE.expression_writing_max_points,10);
 assert.equal(getWrittenExamTotals(L135_TEMPLATE).totalWithExpression,100);
 assert.deepEqual(L135_TEMPLATE.sections.map(s=>s.points),[20,10,10,10,10,10,10,10]);
});
test('A1 model preserves its 60 questions with an 80-point scale and 80-minute duration',()=>{
 assert.equal(A1_TEMPLATE.sections.reduce((n,s)=>n+s.points,0),80);
 assert.equal(getWrittenExamTotals(A1_TEMPLATE).raw,80);
 assert.equal(A1_TEMPLATE.duration_minutes,80);
 assert.equal(A1_TEMPLATE.display_scale,100);
 assert.equal(A1_TEMPLATE.expression_writing_max_points,20);
 assert.equal(getWrittenExamTotals(A1_TEMPLATE).totalWithExpression,100);
 assert.equal(A1_TEMPLATE.sections.reduce((n,s)=>n+s.questions.length,0),60);
 assert.deepEqual(A1_TEMPLATE.sections.map(s=>s.points),[20,5,5,5,5,5,5,5,5,20]);
 assert.deepEqual(validateWrittenExam({...A1_TEMPLATE,class_ids:['class-1']}),[]);
});
test('reading comprehension timers include a separate first-question reading allowance',()=>{
 const a1=A1_TEMPLATE.sections[0].questions;
 const l135=L135_TEMPLATE.sections[0].questions;
 assert.equal(a1[0].time_limit_seconds,(a1[0].type==='qcm'?50:90)+60);
 assert.equal(l135[0].time_limit_seconds,(l135[0].type==='qcm'?50:90)+90);
 for(const question of [...a1.slice(1),...l135.slice(1)]){
  assert.equal(question.time_limit_seconds,question.type==='qcm'?50:90);
 }
});
test('exam template instructions stay concise and corrections are enabled by default',()=>{
 for(const template of [A1_TEMPLATE,L135_TEMPLATE]){
  assert.equal(template.show_corrections_after_publish,true);
  assert.ok(template.sections[0].instructions.length<180);
  assert.ok(template.sections.every(section=>section.instructions.length<300));
 }
});
test('A1 and L135 template prompts use short instructions without answer hints',()=>{
 for(const template of [A1_TEMPLATE,L135_TEMPLATE]){
  const prepositions=template.sections.find(section=>section.title.includes('Prépositions'));
  assert.ok(prepositions);
  assert.ok(prepositions!.instructions.length<80);
  for(const question of prepositions!.questions){
   assert.match(question.prompt,/^Completa con la preposizione corretta:/);
   assert.doesNotMatch(question.prompt,/\b(?:destinazione|Paese|posizione|provenienza|durata|da quanto tempo)\b/i);
   assert.ok(question.prompt.length<100);
  }
 }
});
test('raw maximum follows actual question points, not a fixed template total',()=>{
 const section=createSection('Compréhension',10);
 section.questions=[{id:'q1',type:'text',prompt:'Ciao?',points:2,answer_key:{acceptedAnswers:['ciao']}}];
 assert.equal(getWrittenExamTotals({sections:[section],display_scale:100}).raw,2);
 assert.equal(getWrittenExamTotals({sections:[section],display_scale:100}).planned,10);
});
test('L135 comprehension contains the source text and ten questions with complete-sentence answer guidance',()=>{
 const section=L135_TEMPLATE.sections[0];
 assert.equal(section.questions.length,10);
 assert.ok(section.support_text?.includes('La cucina italiana non è una sola'));
 assert.ok(!section.support_text?.includes('{{'));
 assert.equal(section.questions.reduce((n,q)=>n+q.points,0),20);
 assert.deepEqual(validateWrittenExam({...L135_TEMPLATE,class_ids:['class-1']}),[]);
 assert.ok(section.questions[7].answer_key.acceptedAnswers?.includes('Il tempo totale è di 100 minuti.'));
 assert.equal(section.questions[9].manual_review,true);
});
test('A1 comprehension accepts full sentences and equivalent answers for Marco',()=>{
 const questions=A1_TEMPLATE.sections[0].questions;
 const residence=questions.find(q=>q.answer_key.acceptedAnswers?.includes('Marco abita a Roma.'));
 assert.ok(residence?.answer_key.acceptedAnswers?.includes('Marco abita a Roma.'));
 assert.ok(residence?.answer_key.acceptedAnswers?.includes('Marco vive a Roma.'));
 assert.ok(residence?.answer_key.acceptedAnswers?.includes('A Roma.'));
 const age=questions.find(q=>q.answer_key.acceptedAnswers?.includes('Marco ha vent’anni.'));
 assert.ok(age?.answer_key.acceptedAnswers?.includes('Marco ha vent’anni.'));
});
test('missing per-question timer RPC error gives migration and safe re-save instructions',()=>{
 const message=formatWrittenExamTimeSaveError({code:'PGRST202',message:'Could not find the function public.save_written_exam_question_time_limits(p_time_limits, p_version_id) in the schema cache'});
 assert.match(message,/20261110000000_written_exam_question_timers\.sql/);
 assert.match(message,/brouillon du sujet a déjà été enregistré/);
 assert.match(message,/réenregistrez ce même sujet/);
 assert.equal(formatWrittenExamTimeSaveError({message:'Erreur réseau'}),'Erreur réseau');
});
test('validation rejects missing class, missing questions and invalid answer keys',()=>{
 const errors=validateWrittenExam({...A1_TEMPLATE,class_ids:[],sections:[createSection('Grammaire',5)]});
 assert.ok(errors.some(error=>error.includes('classe')));
 assert.ok(errors.some(error=>error.includes('ajoutez au moins une question')));
});
test('question order restores the exact stored attempt order and option order',()=>{
 const sections=[{id:'s1',questions:[{id:'q1',public_data:{options:[{id:'a'},{id:'b'}]}}]}];
 const ordered=applyWrittenExamOrder(sections,{sections:['s1'],questions:{s1:['q1']},options:{q1:['b','a']},items:{}});
 assert.deepEqual(ordered[0].questions[0].options.map((x:any)=>x.id),['b','a']);
});

test('quiz-imported questions preserve their individual time limit and use a safe default',()=>{
 assert.equal(getWrittenQuestionTimeLimit({time_limit_seconds:8}),8);
 assert.equal(getWrittenQuestionTimeLimit({public_data:{time_limit_seconds:45}}),45);
 assert.equal(getWrittenQuestionTimeLimit({type:'qcm'}),17);
 assert.equal(getWrittenQuestionTimeLimit({type:'text'}),32);
 assert.equal(getWrittenQuestionTimeLimit({type:'verbes_trous'}),32);
 assert.equal(getWrittenQuestionTimeLimit({type:'text',time_limit_seconds:0}),32);
});
test('per-question clock resumes at the correct randomized question from the server start time',()=>{
 const sections=[{questions:[{id:'q-b',time_limit_seconds:8},{id:'q-a',time_limit_seconds:15},{id:'q-c',time_limit_seconds:10}]}];
 const startedAt='2026-11-08T10:00:00.000Z';
 assert.equal(getTimedQuestionIndex(sections,startedAt,new Date(startedAt).getTime()+7_000),0);
 assert.equal(getTimedQuestionRemainingSeconds(sections,0,startedAt,new Date(startedAt).getTime()+7_000),1);
 assert.equal(getTimedQuestionIndex(sections,startedAt,new Date(startedAt).getTime()+8_000),1);
 assert.equal(getTimedQuestionRemainingSeconds(sections,1,startedAt,new Date(startedAt).getTime()+18_000),5);
 assert.equal(getTimedQuestionIndex(sections,startedAt,new Date(startedAt).getTime()+33_000),3);
});

test('new manually created questions receive quiz-compatible defaults and invalid timer values are rejected',()=>{
 assert.equal(createQuestion('qcm').time_limit_seconds,17);
 assert.equal(createQuestion('text').time_limit_seconds,32);
 const section=createSection('Timed');
 section.questions=[{id:'bad-time',type:'text',prompt:'Ciao?',points:1,time_limit_seconds:3601,answer_key:{acceptedAnswers:['ciao']}}];
 const errors=validateWrittenExam({...A1_TEMPLATE,class_ids:['class-1'],sections:[section]});
 assert.ok(errors.some(error=>error.includes('temps doit être compris entre 1 et 3600')));
});
test('iOS and other mobile visibility changes never disqualify a written exam',()=>{
 assert.equal(shouldDisqualifyWrittenExamVisibilityChange(true),false);
 assert.equal(shouldDisqualifyWrittenExamVisibilityChange(false),true);
});
