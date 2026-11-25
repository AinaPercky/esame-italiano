import React,{useState} from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {getDefaultWrittenQuestionTimeLimit} from '../utils/writtenExam';
import {formatCorrectMotsTrousForDisplay, formatMotsTrousAnswerForDisplay, noterMotsTrous, type MotsTrousAnswerKeyPhrase} from '../utils/motsTrous';
import {formatWrittenExamTextExpected, gradeWrittenExamTextQuestion, normalizeAnswerText} from '../utils/quizAnswerMatcher';
import {normalizeVerbesTrousAnswer} from '../utils/verbesTrous';

type Props={attempt:any;version:any;manualScores:Record<string,number>;onManualScore:(id:string,value:number)=>void};

const normalize=(value:any)=>normalizeAnswerText(String(value??''));
const parseArray=(value:any):any[]=>{
 if(Array.isArray(value))return value;
 if(typeof value==='string'){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return value? [value]:[];}}
 return value==null?[]:[value];
};
const parseObject=(value:any):Record<string,any>=>{
 if(value&&typeof value==='object'&&!Array.isArray(value))return value;
 if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return {};}}
 return {};
};
const keyOf=(q:any)=>Array.isArray(q.written_exam_answer_keys)?q.written_exam_answer_keys[0]?.answer_key||{}:q.written_exam_answer_keys?.answer_key||{};
const publicOf=(q:any)=>q.public_data||{};
const answerOf=(attempt:any,q:any)=>attempt.answers?.[q.id]??attempt.answers?.[q.question_key]??null;
const hasResponse=(value:any):boolean=>{
 if(value===null||value===undefined)return false;
 if(typeof value==='string'){
  const text=value.trim();if(!text)return false;
  try{const parsed=JSON.parse(text);if(parsed===null)return false;if(Array.isArray(parsed))return parsed.some(hasResponse);if(typeof parsed==='object')return Object.values(parsed).some(hasResponse);}catch{/* Une chaîne non vide est une réponse. */}
  return true;
 }
 if(Array.isArray(value))return value.some(hasResponse);
 if(typeof value==='object')return Object.values(value).some(hasResponse);
 return true;
};
const correctText=(q:any)=>{
 const key=keyOf(q);const pub=publicOf(q);
 if(q.question_type==='qcm')return (pub.options||[]).find((o:any)=>o.id===key.correctOptionId)?.label||'Corrigé indisponible';
 if(q.question_type==='text'){
  return formatWrittenExamTextExpected(q.prompt||'',key,pub.blank_count);
 }
 if(q.question_type==='reorder'){
  const items=pub.items||[];return (key.correctOrder||[]).map((id:string)=>items.find((x:any)=>x.id===id)?.text||id).join(' → ');
 }
 if(q.question_type==='verbes_trous'){
  return (key.phrases||[]).map((p:any,i:number)=>'Phrase '+(i+1)+' : '+p.verbe+' ('+(p.reponses||[]).join(' / ')+')').join(' · ');
 }
 if(q.question_type==='mots_trous'){
  return formatCorrectMotsTrousForDisplay(pub.mots_trous,key.phrases);
 }
 return '—';
};
const studentText=(q:any,value:any)=>{
 if(value==null||value==='')return 'Aucune réponse';
 const pub=publicOf(q);
 if(q.question_type==='qcm')return (pub.options||[]).find((o:any)=>o.id===String(value))?.label||String(value);
 if(q.question_type==='reorder'){
  const items=pub.items||[];return parseArray(value).map((id:any)=>items.find((x:any)=>x.id===id)?.text||String(id)).join(' → ')||'Aucune réponse';
 }
 if(q.question_type==='verbes_trous'){
  const parsed=parseObject(value);const phrases=pub.verbes_trous?.phrases||[];
  return phrases.map((p:any,i:number)=>{const a=parsed[String(p.id)]||{};return (i+1)+'. Verbe choisi : '+(a.verbe_choisi||'—')+' · Conjugaison : '+(a.texte_saisi||'—');}).join('\n')||'Aucune réponse';
 }
 if(q.question_type==='mots_trous'){
  return formatMotsTrousAnswerForDisplay(pub.mots_trous,value);
 }
 const parsed=parseArray(value);
 return parsed.map((x:any)=>String(x??'')).join(' | ')||'Aucune réponse';
};
const autoScore=(q:any,value:any)=>{
 const points=Number(q.points)||0;const key=keyOf(q);const pub=publicOf(q);
 if(q.question_type==='qcm'){
  const correctId=String(key.correctOptionId??'');
  if(String(value??'')===correctId)return points;
  const expectedLabel=(pub.options||[]).find((o:any)=>String(o.id)===correctId)?.label;
  return expectedLabel&&normalize(expectedLabel)===normalize(value)?points:0;
 }
 if(q.question_type==='text'){
  return gradeWrittenExamTextQuestion(q.prompt||'',key,pub.blank_count,value,points);
 }
 if(q.question_type==='reorder'){
  const expected=key.correctOrder||[];const actual=parseArray(value);let hits=0;
  expected.forEach((id:string,i:number)=>{if(String(actual[i]??'')===id)hits++;});
  return expected.length?Math.round(points*hits/expected.length*100)/100:0;
 }
 if(q.question_type==='verbes_trous'){
  const actual=parseObject(value);const phrases=key.phrases||[];const bank=(pub.verbes_trous?.banque||[]).map((x:any)=>normalizeVerbesTrousAnswer(String(x)));const used=new Set<string>();let score=0;
  phrases.forEach((phrase:any)=>{
   const answer=actual[String(phrase.id)]||{};
   const chosen=normalizeVerbesTrousAnswer(String(answer.verbe_choisi||''));
   const expected=normalizeVerbesTrousAnswer(String(phrase.verbe||''));
   const unique=!!chosen&&!used.has(chosen)&&(bank.length===0||bank.includes(chosen));
   if(unique){
    used.add(chosen);
    if(chosen===expected)score+=1;
    const typedNorm=normalizeVerbesTrousAnswer(String(answer.texte_saisi||''),true);
    const expanded=(phrase.reponses||[]).flatMap((r:any)=>String(r??'').split(/\s*[\/;|]\s*/).map((s:string)=>s.trim()).filter(Boolean));
    if(typedNorm&&expanded.some((x:string)=>normalizeVerbesTrousAnswer(x,true)===typedNorm))score+=2;
   }
  });
  return Math.min(points,score);
 }
 if(q.question_type==='mots_trous'){
  const def=pub.mots_trous||{banque:[],phrases:[]};
  const scored=noterMotsTrous(def,value,(key.phrases||[]) as MotsTrousAnswerKeyPhrase[]);
  return Math.min(points,scored.score);
 }
 return 0;
};

export const getWrittenQuestionAutoScore=autoScore;

export const createWrittenExamCopyPdf=(attempt:any,version:any)=>{
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
 const student=[attempt.students?.first_name,attempt.students?.last_name].filter(Boolean).join(' ')||'Élève';
 doc.setFontSize(16);doc.text('Feuille de copie – '+(version?.title||attempt.exam?.title||'Examen écrit'),14,18);
 doc.setFontSize(10);doc.text('Élève : '+student,14,26);doc.text('Date : '+(attempt.submitted_at?new Date(attempt.submitted_at).toLocaleString():'—'),14,32);
 doc.text('Résultat : '+(attempt.raw_score??'—')+' / '+(attempt.raw_max??'—')+(attempt.expression_writing_max_points>0?' · Expression écrite : '+(attempt.expression_writing_score??'—')+'/'+attempt.expression_writing_max_points:'')+(attempt.normalized_score!=null?' · '+attempt.normalized_score:''),14,38);
 const sourceSections=[...(version?.written_exam_sections||[])];const byId=new Map(sourceSections.map((s:any)=>[s.id,s]));
 const sectionIds=Array.isArray(attempt.order_manifest?.sections)&&attempt.order_manifest.sections.length?attempt.order_manifest.sections:sourceSections.sort((a:any,b:any)=>a.position-b.position).map((s:any)=>s.id);
 const rows:any[]=[];
 sectionIds.forEach((sid:string)=>{const section:any=byId.get(sid);if(!section)return;rows.push([{content:section.title,colSpan:4,styles:{fontStyle:'bold',fillColor:[230,240,247],textColor:[7,42,63]}}]);const all=[...(section.written_exam_questions||[])];const map=new Map(all.map((q:any)=>[q.id,q]));const ids=attempt.order_manifest?.questions?.[sid]||all.sort((a:any,b:any)=>a.position-b.position).map((q:any)=>q.id);ids.forEach((id:string,idx:number)=>{const q:any=map.get(id);if(!q)return;const answer=answerOf(attempt,q);const score=autoScore(q,answer);const awarded=attempt.manual_scores?.[q.id]!=null?Number(attempt.manual_scores[q.id]):Number(score??0);rows.push([String(idx+1)+'. '+q.prompt,'Élève : '+studentText(q,answer),'Attendu : '+correctText(q),awarded+' / '+q.points]);});});
 autoTable(doc,{startY:44,head:[['Question','Réponse de l’élève','Réponse correcte / attendue','Points']],body:rows,styles:{fontSize:8,cellPadding:2.5,overflow:'linebreak',valign:'top'},headStyles:{fillColor:[11,60,93]},columnStyles:{0:{cellWidth:45},1:{cellWidth:49},2:{cellWidth:62},3:{cellWidth:22}},margin:{left:14,right:14}});
 return doc;
};

export const downloadWrittenExamCopyPdf=(attempt:any,version:any)=>{
 const student=[attempt.students?.first_name,attempt.students?.last_name].filter(Boolean).join(' ')||'eleve';
 createWrittenExamCopyPdf(attempt,version).save('feuille-copie-'+student.toLocaleLowerCase().replace(/[^a-z0-9]+/g,'-')+'.pdf');
};

export const WrittenExamCopy:React.FC<Props>=({attempt,version,manualScores,onManualScore})=>{
 const [questionFilter,setQuestionFilter]=useState<'all'|'review'|'correct'|'missing'>('all');
 const sourceSections=[...(version?.written_exam_sections||[])];const sectionById=new Map(sourceSections.map((section:any)=>[section.id,section]));const manifestSections=attempt.order_manifest?.sections;const sectionIds=Array.isArray(manifestSections)&&manifestSections.length?manifestSections:sourceSections.sort((a:any,b:any)=>a.position-b.position).map((section:any)=>section.id);const sections=sectionIds.map((id:string)=>sectionById.get(id)).filter(Boolean).map((section:any)=>{const questions=[...(section.written_exam_questions||[])];const questionById=new Map(questions.map((question:any)=>[question.id,question]));const manifestQuestions=attempt.order_manifest?.questions?.[section.id];const ids=Array.isArray(manifestQuestions)&&manifestQuestions.length?manifestQuestions:questions.sort((a:any,b:any)=>a.position-b.position).map((question:any)=>question.id);return {...section,written_exam_questions:ids.map((id:string)=>questionById.get(id)).filter(Boolean)};});
 const questionStatus=(q:any):'missing'|'correct'|'review'=>{
  const answer=answerOf(attempt,q);if(!hasResponse(answer))return 'missing';
  const score=autoScore(q,answer);
  const awarded=Number(manualScores[q.id]??attempt.manual_scores?.[q.id]??score??0);
  return awarded>=Number(q.points||0)&&Number(q.points||0)>0?'correct':'review';
 };
 const allQuestions=sections.flatMap((section:any)=>(section.written_exam_questions||[]));
 const counts={all:allQuestions.length,review:allQuestions.filter((q:any)=>questionStatus(q)==='review').length,correct:allQuestions.filter((q:any)=>questionStatus(q)==='correct').length,missing:allQuestions.filter((q:any)=>questionStatus(q)==='missing').length};
 return <div className="mt-2 space-y-3 sm:mt-4 sm:space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b pb-2 sm:gap-2 sm:pb-3"><div><h4 className="font-bold text-[#072a3f]">Feuille de copie détaillée</h4><p className="text-xs text-slate-500">Réponses de l’élève, corrigé attendu et points par question.</p></div><span className="rounded-lg bg-[#e6f0f7] px-3 py-1 text-xs font-bold text-[#0b3c5d]">{counts.all} questions</span></div>
  <div className="flex flex-col gap-1.5 rounded-lg border border-[#d8e6ee] bg-white px-2.5 py-1.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:p-3">
   <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><p className="text-xs font-bold text-[#072a3f] sm:text-sm">Filtrer les questions</p><p className="text-[10px] text-slate-500 sm:text-xs">{counts.correct} justes · {counts.review} à vérifier · {counts.missing} sans réponse</p></div>
   <div className="flex max-w-full flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]" role="group" aria-label="Filtrer les questions de l’examen">
    {([{id:'all',label:'Tous',count:counts.all},{id:'review',label:'À vérifier',count:counts.review},{id:'correct',label:'Réponse juste',count:counts.correct},{id:'missing',label:'Absence de réponse',count:counts.missing}] as const).map(filter=><button key={filter.id} type="button" aria-pressed={questionFilter===filter.id} onClick={()=>setQuestionFilter(filter.id)} className={'min-h-8 shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] sm:min-h-10 sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs '+(questionFilter===filter.id?(filter.id==='review'?'border-rose-700 bg-rose-700 text-white':filter.id==='correct'?'border-emerald-700 bg-emerald-700 text-white':filter.id==='missing'?'border-slate-600 bg-slate-600 text-white':'border-[#0b3c5d] bg-[#0b3c5d] text-white'):'border-[#cbd9e2] bg-white text-[#46657a] hover:bg-[#f3f8fb]')}>{filter.label} ({filter.count})</button>)}
   </div>
  </div>
  {Number(attempt.expression_writing_max_points||0)>0&&<div className="flex items-center justify-between rounded-lg border border-[#b9d8c9] bg-[#f6fbf8] p-2 text-xs sm:rounded-xl sm:p-3 sm:text-sm"><span className="font-semibold text-[#072a3f]">Expression écrite</span><strong>{attempt.expression_writing_score??'À noter'} / {attempt.expression_writing_max_points}</strong></div>}
  {sections.map((section:any,si:number)=>{
   const questions=[...(section.written_exam_questions||[])].filter((q:any)=>questionFilter==='all'||questionStatus(q)===questionFilter);
   const sectionResult=(attempt.written_exam_section_results||[]).find((r:any)=>r.section_id===section.id);
   if(!questions.length)return null;
   return <section key={section.id} className="overflow-hidden rounded-xl border border-[#d8e6ee]">
    <div className="flex flex-wrap items-center justify-between gap-1.5 bg-[#f3f8fb] px-3 py-1.5 sm:gap-2 sm:py-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#2fa36b]">Partie {si+1}</p><h5 className="font-bold text-[#072a3f]">{section.title}</h5></div><strong className="text-sm">{sectionResult?.raw_score??'—'} / {sectionResult?.raw_max??questions.reduce((n:number,q:any)=>n+Number(q.points||0),0)} pts</strong></div>
    <div className="divide-y divide-slate-100">{questions.map((q:any,qi:number)=>{
     const answer=answerOf(attempt,q);const score=autoScore(q,answer);const manual=Number(manualScores[q.id]??attempt.manual_scores?.[q.id]??score??0);const hasManualOverride=manualScores[q.id]!==undefined||attempt.manual_scores?.[q.id]!==undefined;const reviewable=true;const awarded=hasManualOverride?manual:score;
     const publicData=publicOf(q);const status=questionStatus(q);
     return <article key={q.id} className="space-y-2 p-2.5 sm:space-y-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Question {allQuestions.findIndex((item:any)=>item.id===q.id)+1} · {q.question_type==='qcm'?'QCM':q.question_type==='text'?'Réponse texte':q.question_type==='reorder'?'Réordonnement':q.question_type==='mots_trous'?'Mots à trous avec banque':'Verbes à trous'} · {publicData.time_limit_seconds||getDefaultWrittenQuestionTimeLimit({type:q.question_type})} s</p><p className="mt-1 text-sm font-semibold text-[#072a3f]">{q.prompt}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><span className={'rounded-md border px-2.5 py-1.5 text-[11px] font-extrabold '+(status==='correct'?'border-emerald-200 bg-emerald-50 text-emerald-800':status==='missing'?'border-slate-200 bg-slate-100 text-slate-700':'border-rose-200 bg-rose-50 text-rose-800')}>{status==='correct'?'Réponse juste':status==='missing'?'Absence de réponse':'À vérifier'}</span><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold">{q.points} pt{Number(q.points)===1?'':'s'}</span></div></div>
      {publicData.verbes_trous?.titre&&<p className="text-xs text-slate-500">{publicData.verbes_trous.titre}</p>}
      {publicData.mots_trous?.titre&&<p className="text-xs text-slate-500">{publicData.mots_trous.titre}</p>}
      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-5">
       <div className={'min-h-[110px] rounded-lg border p-3 sm:min-h-[180px] sm:rounded-xl sm:p-5 '+(status==='correct'?'border-emerald-200 bg-emerald-50':status==='missing'?'border-slate-200 bg-slate-50':'border-rose-200 bg-rose-50')}><p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Réponse de l’élève</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 sm:mt-3 sm:text-base sm:leading-7">{studentText(q,answer)}</p></div>
       <div className="min-h-[110px] rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 sm:min-h-[180px] sm:rounded-xl sm:p-5"><p className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">Réponse correcte / attendue</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-slate-800">{correctText(q)}</p></div>
      </div>
      {reviewable?<div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 sm:grid-cols-[1fr_120px] sm:items-center sm:p-3"><div><p className="text-xs font-bold text-amber-900">{q.manual_review?'Vérification requise':'Vérification de la note automatique'}</p><p className="text-[11px] text-amber-800">Score automatique proposé : {score??0} / {q.points}. La réponse originale est en lecture seule. Confirmez ou ajustez uniquement les points attribués.</p></div><label className="text-xs font-semibold">Points obtenus<input type="number" min="0" max={q.points} step=".25" className="mt-1 min-h-9 w-full rounded-lg border border-amber-300 bg-white p-1.5 text-sm sm:p-2" value={manualScores[q.id]??attempt.manual_scores?.[q.id]??score??0} onChange={e=>onManualScore(q.id,Math.max(0,Math.min(Number(q.points),Number(e.target.value))))}/></label></div>:<div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] sm:px-3 sm:py-2 sm:text-xs"><span className="text-slate-500">Points automatiques</span><strong className={Number(awarded)===Number(q.points)?'text-emerald-700':'text-[#072a3f]'}>{awarded} / {q.points}</strong></div>}
     </article>;
    })}</div>
   </section>;
  })}
  {allQuestions.length>0&&counts[questionFilter]===0&&<div className="rounded-xl border border-[#d8e6ee] bg-white p-8 text-center text-sm text-slate-500">Aucune question dans cette catégorie.</div>}
 </div>;
};
