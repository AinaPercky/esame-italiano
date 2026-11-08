import React from 'react';

type Props={attempt:any;version:any;manualScores:Record<string,number>;onManualScore:(id:string,value:number)=>void};

const normalize=(value:any)=>String(value??'').trim().replace(/\\s+/g,' ').toLocaleLowerCase('it-IT');
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
const correctText=(q:any)=>{
 const key=keyOf(q);const pub=publicOf(q);
 if(q.question_type==='qcm')return (pub.options||[]).find((o:any)=>o.id===key.correctOptionId)?.label||'Corrigé indisponible';
 if(q.question_type==='text'){
  if(Array.isArray(key.answers))return key.answers.map((variants:any,i:number)=>'Trou '+(i+1)+' : '+(Array.isArray(variants)?variants.join(' / '):String(variants))).join(' · ');
  return (key.acceptedAnswers||[]).join(' / ')||'Correction manuelle';
 }
 if(q.question_type==='reorder'){
  const items=pub.items||[];return (key.correctOrder||[]).map((id:string)=>items.find((x:any)=>x.id===id)?.text||id).join(' → ');
 }
 if(q.question_type==='verbes_trous'){
  return (key.phrases||[]).map((p:any,i:number)=>'Phrase '+(i+1)+' : '+p.verbe+' ('+(p.reponses||[]).join(' / ')+')').join(' · ');
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
 const parsed=parseArray(value);
 return parsed.map((x:any)=>String(x??'')).join(' | ')||'Aucune réponse';
};
const autoScore=(q:any,value:any)=>{
 if(q.manual_review)return null;
 const points=Number(q.points)||0;const key=keyOf(q);const pub=publicOf(q);
 if(q.question_type==='qcm')return String(value??'')===String(key.correctOptionId??'')?points:0;
 if(q.question_type==='text'){
  if(Array.isArray(key.answers)){
   const actual=parseArray(value);const expected=key.answers;let hits=0;
   expected.forEach((variants:any,i:number)=>{const accepted=Array.isArray(variants)?variants:[variants];if(accepted.some((x:any)=>normalize(x)===normalize(actual[i])))hits++;});
   return expected.length?Math.round(points*hits/expected.length*100)/100:0;
  }
  const accepted=key.acceptedAnswers||[];return accepted.some((x:any)=>normalize(x)===normalize(value))?points:0;
 }
 if(q.question_type==='reorder'){
  const expected=key.correctOrder||[];const actual=parseArray(value);let hits=0;
  expected.forEach((id:string,i:number)=>{if(String(actual[i]??'')===id)hits++;});
  return expected.length?Math.round(points*hits/expected.length*100)/100:0;
 }
 if(q.question_type==='verbes_trous'){
  const actual=parseObject(value);const phrases=key.phrases||[];const bank=(pub.verbes_trous?.banque||[]).map((x:any)=>normalize(x));const used=new Set<string>();let score=0;
  phrases.forEach((phrase:any)=>{const answer=actual[String(phrase.id)]||{};const chosen=normalize(answer.verbe_choisi);const expected=normalize(phrase.verbe);const unique=!!chosen&&!used.has(chosen)&&bank.includes(chosen);if(unique){used.add(chosen);if(chosen===expected)score+=1;if((phrase.reponses||[]).some((x:any)=>normalize(x)===normalize(answer.texte_saisi)))score+=2;}});
  return Math.min(points,score);
 }
 return 0;
};

export const WrittenExamCopy:React.FC<Props>=({attempt,version,manualScores,onManualScore})=>{
 const sourceSections=[...(version?.written_exam_sections||[])];const sectionById=new Map(sourceSections.map((section:any)=>[section.id,section]));const sectionIds=attempt.order_manifest?.sections||sourceSections.sort((a:any,b:any)=>a.position-b.position).map((section:any)=>section.id);const sections=sectionIds.map((id:string)=>sectionById.get(id)).filter(Boolean).map((section:any)=>{const questions=[...(section.written_exam_questions||[])];const questionById=new Map(questions.map((question:any)=>[question.id,question]));const ids=attempt.order_manifest?.questions?.[section.id]||questions.sort((a:any,b:any)=>a.position-b.position).map((question:any)=>question.id);return {...section,written_exam_questions:ids.map((id:string)=>questionById.get(id)).filter(Boolean)};});
 return <div className="mt-4 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"><div><h4 className="font-bold text-[#072a3f]">Feuille de copie détaillée</h4><p className="text-xs text-slate-500">Réponses de l’élève, corrigé attendu et points par question.</p></div><span className="rounded-lg bg-[#e6f0f7] px-3 py-1 text-xs font-bold text-[#0b3c5d]">{sections.reduce((n:number,s:any)=>n+(s.written_exam_questions||[]).length,0)} questions</span></div>
  {sections.map((section:any,si:number)=>{
   const questions=[...(section.written_exam_questions||[])].sort((a:any,b:any)=>a.position-b.position);
   const sectionResult=(attempt.written_exam_section_results||[]).find((r:any)=>r.section_id===section.id);
   return <section key={section.id} className="overflow-hidden rounded-xl border border-[#d8e6ee]">
    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f3f8fb] px-3 py-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#2fa36b]">Partie {si+1}</p><h5 className="font-bold text-[#072a3f]">{section.title}</h5></div><strong className="text-sm">{sectionResult?.raw_score??'—'} / {sectionResult?.raw_max??questions.reduce((n:number,q:any)=>n+Number(q.points||0),0)} pts</strong></div>
    <div className="divide-y divide-slate-100">{questions.map((q:any,qi:number)=>{
     const answer=answerOf(attempt,q);const score=autoScore(q,answer);const manual=Number(attempt.manual_scores?.[q.id]??manualScores[q.id]??0);const awarded=q.manual_review?manual:score;
     const key=keyOf(q);const publicData=publicOf(q);
     return <article key={q.id} className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Question {qi+1} · {q.question_type==='qcm'?'QCM':q.question_type==='text'?'Réponse texte':q.question_type==='reorder'?'Réordonnement':'Verbes à trous'} · {publicData.time_limit_seconds||30} s</p><p className="mt-1 text-sm font-semibold text-[#072a3f]">{q.prompt}</p></div><span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold">{q.points} pt{Number(q.points)===1?'':'s'}</span></div>
      {publicData.verbes_trous?.titre&&<p className="text-xs text-slate-500">{publicData.verbes_trous.titre}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
       <div className="rounded-lg border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Réponse de l’élève</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{studentText(q,answer)}</p></div>
       <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Réponse correcte / attendue</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{q.manual_review?'Aucune réponse modèle définie : appréciation du professeur.':correctText(q)}</p></div>
      </div>
      {q.manual_review?<div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:grid-cols-[1fr_120px] sm:items-center"><div><p className="text-xs font-bold text-amber-900">Correction manuelle requise</p><p className="text-[11px] text-amber-800">Attribuez les points après lecture de la réponse.</p></div><label className="text-xs font-semibold">Points obtenus<input type="number" min="0" max={q.points} step=".25" className="mt-1 w-full rounded-lg border border-amber-300 bg-white p-2" value={manualScores[q.id]??attempt.manual_scores?.[q.id]??0} onChange={e=>onManualScore(q.id,Math.max(0,Math.min(Number(q.points),Number(e.target.value))))}/></label></div>:<div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">Points automatiques</span><strong className={Number(awarded)===Number(q.points)?'text-emerald-700':'text-[#072a3f]'}>{awarded} / {q.points}</strong></div>}
     </article>;
    })}</div>
   </section>;
  })}
 </div>;
};
