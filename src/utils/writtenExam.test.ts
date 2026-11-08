import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A1_TEMPLATE, L135_TEMPLATE, createSection, getWrittenExamTotals, validateWrittenExam, applyWrittenExamOrder, getWrittenQuestionTimeLimit, getTimedQuestionIndex, getTimedQuestionRemainingSeconds } from './writtenExam';

test('L135 model starts with a 90-point configurable allocation and 90-minute duration',()=>{
 assert.equal(L135_TEMPLATE.sections.reduce((n,s)=>n+s.points,0),90);
 assert.equal(getWrittenExamTotals(L135_TEMPLATE).raw,90);
 assert.equal(L135_TEMPLATE.duration_minutes,90);
 assert.deepEqual(L135_TEMPLATE.sections.map(s=>s.points),[20,10,10,10,10,10,10,10]);
});
test('A1 model preserves its 60 questions with an 80-point scale and 70-minute duration',()=>{
 assert.equal(A1_TEMPLATE.sections.reduce((n,s)=>n+s.points,0),80);
 assert.equal(getWrittenExamTotals(A1_TEMPLATE).raw,80);
 assert.equal(A1_TEMPLATE.duration_minutes,70);
 assert.equal(A1_TEMPLATE.display_scale,80);
 assert.equal(A1_TEMPLATE.sections.reduce((n,s)=>n+s.questions.length,0),60);
 assert.deepEqual(A1_TEMPLATE.sections.map(s=>s.points),[20,5,5,5,5,5,5,5,5,20]);
 assert.deepEqual(validateWrittenExam({...A1_TEMPLATE,class_ids:['class-1']}),[]);
});
test('raw maximum follows actual question points, not a fixed template total',()=>{
 const section=createSection('Compréhension',10);
 section.questions=[{id:'q1',type:'text',prompt:'Ciao?',points:2,answer_key:{acceptedAnswers:['ciao']}}];
 assert.equal(getWrittenExamTotals({sections:[section],display_scale:100}).raw,2);
 assert.equal(getWrittenExamTotals({sections:[section],display_scale:100}).planned,10);
});
test('L135 remains an editable scaffold until its source text and comprehension prompts are supplied',()=>{
 const errors=validateWrittenExam({...L135_TEMPLATE,class_ids:['class-1']});
 assert.ok(errors.some(error=>error.includes('texte-support')));
 assert.ok(errors.some(error=>error.includes('canevas à compléter')));
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
 assert.equal(getWrittenQuestionTimeLimit({}),30);
 assert.equal(getWrittenQuestionTimeLimit({time_limit_seconds:0}),30);
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
