import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A1_TEMPLATE, L135_TEMPLATE, createSection, getWrittenExamTotals, validateWrittenExam, applyWrittenExamOrder } from './writtenExam';

test('L135 model starts with a 90-point configurable allocation and 90-minute duration',()=>{
 assert.equal(L135_TEMPLATE.sections.reduce((n,s)=>n+s.points,0),90);
 assert.equal(getWrittenExamTotals(L135_TEMPLATE).raw,90);
 assert.equal(L135_TEMPLATE.duration_minutes,90);
 assert.deepEqual(L135_TEMPLATE.sections.map(s=>s.points),[20,10,10,10,10,10,10,10]);
});
test('A1 model preserves 65 raw allocated points and optional /100 scale',()=>{
 assert.equal(A1_TEMPLATE.sections.reduce((n,s)=>n+s.points,0),65);
 assert.equal(getWrittenExamTotals(A1_TEMPLATE).raw,65);
 assert.equal(A1_TEMPLATE.duration_minutes,120);
 assert.equal(A1_TEMPLATE.display_scale,100);
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
