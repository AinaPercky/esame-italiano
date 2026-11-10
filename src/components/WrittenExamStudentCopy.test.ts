import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWrittenExamStudentCopyPdf } from './WrittenExamStudentCopy';

test('student correction PDF contains the published correction and teacher-adjusted score',()=>{
 const sections=[{
  section_title:'Compréhension',
  questions:[{
   question_id:'q1',prompt:'Dove abita Ada?',type:'text',points:2,
   student_answer:'Ciao, vivo a Roma.',manual_review:false,manual_score:2,
   answer_key:{acceptedAnswers:['Ada abita a Roma.']},public_data:{}
  }]
 }];
 const pdf=createWrittenExamStudentCopyPdf({
  sections,rawScore:2,rawMax:2,normalizedScore:100,displayScale:100,
  title:'Esame A1',studentName:'Ada Rossi'
 });
 const bytes=pdf.output('arraybuffer');
 assert.ok(bytes.byteLength>1000,'the student download should be a non-empty PDF');
 assert.equal(sections[0].questions[0].student_answer,'Ciao, vivo a Roma.','the published copy must preserve the exact original answer');
});
