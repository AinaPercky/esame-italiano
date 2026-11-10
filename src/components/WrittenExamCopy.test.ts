import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWrittenExamCopyPdf } from './WrittenExamCopy';

test('written exam PDF is generated with the original student answer and teacher-awarded score',()=>{
 const attempt={
  students:{first_name:'Ada',last_name:'Rossi'},
  submitted_at:'2026-11-10T10:00:00.000Z',
  raw_score:2,raw_max:2,normalized_score:100,
  answers:{'q-text':'Ciao, vivo a Roma.'},
  manual_scores:{'q-text':2},
  order_manifest:{sections:['s1'],questions:{s1:['q-text']}},
  written_exam_section_results:[{section_id:'s1',raw_score:2,raw_max:2}]
 };
 const originalAnswer=JSON.stringify(attempt.answers);
 const version={title:'Test esame',written_exam_sections:[{
  id:'s1',title:'Comprensione',
  written_exam_questions:[{
   id:'q-text',question_key:'q-text',question_type:'text',prompt:'Dove abita Ada?',
   points:2,manual_review:false,public_data:{},
   written_exam_answer_keys:[{answer_key:{acceptedAnswers:['Ada abita a Roma.']}}]
  }]
 }]};
 const pdf=createWrittenExamCopyPdf(attempt,version);
 const bytes=pdf.output('arraybuffer');
 assert.ok(bytes.byteLength>1000,'the generated PDF should contain a real document');
 assert.equal(JSON.stringify(attempt.answers),originalAnswer,'PDF generation must not mutate student answers');
});
