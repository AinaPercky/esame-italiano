import type { VerbesTrousDefinition, VerbesTrousAnswerKeyPhrase } from './verbesTrous';
export type WrittenQuestionType='qcm'|'text'|'reorder'|'verbes_trous';
export type WrittenAnswerKey={correctOptionId?:string;acceptedAnswers?:string[];answers?:Array<string|string[]>;correctOrder?:string[];phrases?:VerbesTrousAnswerKeyPhrase[]};
export type WrittenQuestion={id:string;type:WrittenQuestionType;prompt:string;points:number;blank_count?:number;options?:Array<{id:string;label:string}>;items?:Array<{id:string;text:string}>;verbes_trous?:VerbesTrousDefinition;answer_key:WrittenAnswerKey;explanation?:string;manual_review?:boolean;shuffle_options?:boolean;source_quiz_id?:string;source_question_id?:string};
export type WrittenSection={id:string;title:string;instructions:string;category?:string;group_name?:string;points:number;shuffle:boolean;fixed_position?:boolean;support_text?:string;support_url?:string;questions:WrittenQuestion[]};
export type WrittenExam={id?:string;title:string;description:string;level:string;target_language:string;instruction_language:string;duration_minutes:number;class_ids:string[];opens_at?:string|null;closes_at?:string|null;status:string;display_scale:number|null;max_attempts:number;shuffle_sections:boolean;shuffle_questions:boolean;shuffle_options:boolean;navigation_mode:'free'|'sequential';show_score_after_publish:boolean;show_corrections_after_publish:boolean;integrity_settings:{fullscreen:boolean;warn_on_tab_switch:boolean;watermark:boolean};sections:WrittenSection[]};
export type WrittenOrderManifest={sections:string[];questions:Record<string,string[]>;options:Record<string,string[]>;items:Record<string,string[]>};
export type WrittenAttempt={attempt_id:string;status:string;deadline_at:string;started_at:string;answers:Record<string,unknown>;order_manifest:WrittenOrderManifest;exam:any;sections:Array<any>};
export const makeId=()=>typeof crypto!=='undefined'&&'randomUUID'in crypto?crypto.randomUUID():`we-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const createSection=(title='Nouvelle section',points=0):WrittenSection=>({id:makeId(),title,instructions:'',points,shuffle:true,questions:[]});
export const createQuestion=(type:WrittenQuestionType='text'):WrittenQuestion=>({id:makeId(),type,prompt:'Nouvelle question',points:1,...(type==='qcm'?{options:[{id:makeId(),label:'Option A'},{id:makeId(),label:'Option B'}]}:{}),...(type==='reorder'?{items:[{id:makeId(),text:'Premier élément'},{id:makeId(),text:'Deuxième élément'}]}:{}),answer_key:type==='qcm'?{correctOptionId:''}:type==='reorder'?{correctOrder:[]}:type==='verbes_trous'?{phrases:[]}:{acceptedAnswers:[]},...(type==='verbes_trous'?{points:3,verbes_trous:{titre:'Verbi riflessivi e presente indicativo',consigne:'Choisissez le verbe qui convient, puis conjuguez-le au présent.',points_par_phrase:3,banque:[],phrases:[]}}:{})});
const textQ=(prompt:string,points:number,answers:string[],extra:Partial<WrittenQuestion>={}):WrittenQuestion=>({id:makeId(),type:'text',prompt,points,answer_key:{acceptedAnswers:answers},...extra});
const qcmQ=(prompt:string,points:number,options:string[],correct:number):WrittenQuestion=>{const opts=options.map(label=>({id:makeId(),label}));return{id:makeId(),type:'qcm',prompt,points,options:opts,answer_key:{correctOptionId:opts[correct].id}};};
const reorderQ=(prompt:string,points:number,words:string[]):WrittenQuestion=>{const items=words.map(text=>({id:makeId(),text}));return{id:makeId(),type:'reorder',prompt,points,items,answer_key:{correctOrder:items.map(x=>x.id)}};};
export const L135_TEMPLATE:WrittenExam={
 title:'L135 – Examen composite',description:'90 points · 1 h 30 · compréhension, grammaire, vocabulaire et réordonnement. Sans production écrite ni orale.',
 level:'B1',target_language:'it',instruction_language:'fr',duration_minutes:90,class_ids:[],status:'draft',display_scale:null,max_attempts:1,
 shuffle_sections:true,shuffle_questions:true,shuffle_options:true,navigation_mode:'free',show_score_after_publish:true,show_corrections_after_publish:false,
 integrity_settings:{fullscreen:false,warn_on_tab_switch:true,watermark:false},
 sections:[
  {...createSection('Compréhension écrite',20),instructions:'Ajoutez le texte source puis remplacez les dix énoncés de questions. Correction manuelle prévue pour ce canevas.',support_text:'{{TEXTE_DE_COMPREHENSION_AJOUTER}}',questions:Array.from({length:10},(_,i)=>({id:makeId(),type:'text' as const,prompt:'{{QUESTION_DE_COMPREHENSION_'+(i+1)+'}}',points:2,manual_review:true,answer_key:{}}))},
  {...createSection('Grammaire – Articles',10),category:'Articles',questions:[textQ('Completa con l’articolo corretto: ___ libro.',2,['il']),textQ('Ho comprato ___ arancia.',2,['un\'','un’']),textQ('___ studenti sono in classe.',2,['gli']),textQ('Vorrei ___ zaino nuovo.',2,['uno']),textQ('___ amica di Luca è gentile.',2,['l\'','l’'])]},
  {...createSection('Grammaire – Conjugaison',10),category:'Conjugaison et verbes',questions:[textQ('Coniuga piacere: A Maria ___ la musica.',2,['piace']),textQ('Coniuga piacere: A noi ___ i libri.',2,['piacciono']),textQ('Io ___ (andare) al lavoro ogni giorno.',2,['vado']),textQ('Loro ___ (fare) sport il sabato.',2,['fanno']),textQ('Tu ___ (alzarsi) alle sette.',2,['ti alzi'])]},
  {...createSection('Grammaire – COD/COI',10),category:'Pronoms directs et indirects',questions:[textQ('Sostituisci «il libro»: Lo ___ ogni sera.',2,['leggo']),textQ('Sostituisci «a Maria»: ___ telefono domani.',2,['le']),textQ('Sostituisci «i ragazzi»: ___ vedo al parco.',2,['li']),textQ('Sostituisci «a Luca»: ___ scrivo un messaggio.',2,['gli']),textQ('Completa: Hai le chiavi? Sì, ___ ho.',2,['le'])]},
  {...createSection('Grammaire – Prépositions',10),category:'Prépositions',questions:[textQ('Vado ___ Roma domani.',2,['a']),textQ('Vivo ___ Madagascar.',2,['in']),textQ('Il libro è ___ tavolo.',2,['sul','sopra il']),textQ('Parto ___ Antananarivo.',2,['da']),textQ('Studio italiano ___ due anni.',2,['da'])]},
  {...createSection('Grammaire – Possessifs',10),category:'Adjectifs possessifs',questions:[textQ('Questo è ___ fratello.',2,['mio']),textQ('Maria cerca ___ borsa.',2,['la sua','sua']),textQ('Abbiamo invitato ___ amici.',2,['i nostri','nostri']),textQ('Luca e Anna amano ___ famiglia.',2,['la loro','loro']),textQ('Dove sono ___ chiavi?',2,['le tue','tue'])]},
  {...createSection('Vocabulaire',10),questions:[textQ('Spiega «a fuoco basso».',2,['a fiamma bassa','a fuoco lento']),textQ('Qual è il significato di «affollato»?',2,['pieno di persone','molto pieno']),textQ('Trova un sinonimo di «veloce».',2,['rapido','svelto']),textQ('Traduci «prendre une décision».',2,['prendere una decisione']),textQ('Che cosa significa «risparmiare»?',2,['spendere meno','mettere da parte denaro'])]},
  {...createSection('Réordonnement',10),instructions:'Rimetti ogni frase nell’ordine corretto.',questions:[reorderQ('Rimetti in ordine la frase.',2,['Domani','vado','al mercato']),reorderQ('Rimetti in ordine la frase.',2,['A Maria','piacciono','i romanzi']),reorderQ('Rimetti in ordine la frase.',2,['Non','ho','capito','la domanda']),reorderQ('Rimetti in ordine la frase.',2,['Ci','vediamo','dopo','la lezione']),reorderQ('Rimetti in ordine la frase.',2,['Ieri','abbiamo','visitato','il museo'])]}
 ]
};
const a1Text='Marco vive a Roma. Ha vent’anni e studia italiano all’università. Ogni mattina prende l’autobus per andare a lezione. Nel fine settimana gioca a calcio con i suoi amici. La sera legge un libro o guarda un film.';
const a1TF=[
 ['Marco vive a Roma.',2,0],['Marco ha venticinque anni.',2,1],['Marco studia italiano.',2,0],['Marco va a lezione in treno.',2,1],['Nel fine settimana gioca a calcio.',2,0]
] as const;
export const A1_TEMPLATE:WrittenExam={
 title:'Esame bianco – Italiano A1',description:'80 points · 1 h 10 · compréhension, grammaire, vocabulaire et phrases à compléter. Sans production écrite ni orale.',
 level:'A1',target_language:'it',instruction_language:'fr',duration_minutes:70,class_ids:[],status:'draft',display_scale:80,max_attempts:1,
 shuffle_sections:true,shuffle_questions:true,shuffle_options:true,navigation_mode:'free',show_score_after_publish:true,show_corrections_after_publish:false,
 integrity_settings:{fullscreen:false,warn_on_tab_switch:true,watermark:false},
 sections:[
  {...createSection('Compréhension écrite',20),instructions:'Leggi il testo e rispondi alle dieci domande.',support_text:a1Text,questions:[
   ...a1TF.map(([prompt,points,correct])=>qcmQ(prompt,points,['Vero','Falso'],correct)),
   textQ('Dove vive Marco?',2,['Roma']),textQ('Quanti anni ha Marco?',2,['venti','20']),textQ('Che cosa studia?',2,['italiano']),textQ('Come va a lezione?',2,['in autobus','autobus']),textQ('Con chi gioca a calcio?',2,['con i suoi amici','con gli amici'])
  ]},
  {...createSection('Grammaire – Articles',5),category:'Articles',questions:[textQ('___ casa è grande.',1,['la']),textQ('Ho ___ libro.',1,['un']),textQ('___ studenti arrivano.',1,['gli']),textQ('Vorrei ___ zaino.',1,['uno']),textQ('___ amica telefona.',1,['un\'','un’'])]},
  {...createSection('Grammaire – Essere / Avere / Stare',5),category:'Essere, avere, stare',questions:[textQ('Io ___ italiano.',1,['sono']),textQ('Tu ___ un fratello.',1,['hai']),textQ('Noi ___ bene.',1,['stiamo']),textQ('Loro ___ studenti.',1,['sono']),textQ('Lei ___ una penna.',1,['ha'])]},
  {...createSection('Grammaire – Présent',5),category:'Présent de l’indicatif',questions:[textQ('Noi ___ (parlare) italiano.',1,['parliamo']),textQ('Tu ___ (vivere) a Tana.',1,['vivi']),textQ('Loro ___ (prendere) il bus.',1,['prendono']),textQ('Io ___ (andare) a scuola.',1,['vado']),textQ('Lei ___ (fare) colazione.',1,['fa'])]},
  {...createSection('Grammaire – Prépositions',5),category:'Prépositions',questions:[textQ('Vado ___ scuola.',1,['a']),textQ('Vivo ___ Madagascar.',1,['in']),textQ('Il libro è ___ tavolo.',1,['sul']),textQ('Vengo ___ casa.',1,['da']),textQ('Esco ___ Maria.',1,['con'])]},
  {...createSection('Grammaire – Possessifs',5),category:'Possessifs',questions:[textQ('Questo è ___ padre.',1,['mio']),textQ('Questa è ___ casa.',1,['la tua','tua']),textQ('Luca cerca ___ libro.',1,['il suo','suo']),textQ('Amiamo ___ scuola.',1,['la nostra','nostra']),textQ('Sono ___ amici.',1,['i loro','loro'])]},
  {...createSection('Vocabulaire – Traduction malgache → italien',5),category:'Traduction',questions:[textQ('Traduisez « trano » en italien.',1,['casa']),textQ('Traduisez « rano » en italien.',1,['acqua']),textQ('Traduisez « boky » en italien.',1,['libro']),textQ('Traduisez « sekoly » en italien.',1,['scuola']),textQ('Traduisez « sakafo » en italien.',1,['cibo','pasto'])]},
  {...createSection('Vocabulaire – QCM lexical',5),category:'QCM lexical',questions:[
   qcmQ('Qual è il contrario di «grande»?',1,['piccolo','alto','lungo'],0),
   qcmQ('Che cosa significa «la mela»?',1,['une pomme','une poire','une banane'],0),
   qcmQ('Quale parola indica un luogo?',1,['correre','scuola','veloce'],1),
   qcmQ('Qual è un giorno della settimana?',1,['gennaio','lunedì','estate'],1),
   qcmQ('Quale parola significa «eau»?',1,['pane','acqua','latte'],1)
  ]},
  {...createSection('Vocabulaire – Antonymes',5),category:'Antonymes',questions:[textQ('Il contrario di «caldo» è…',1,['freddo']),textQ('Il contrario di «alto» è…',1,['basso']),textQ('Il contrario di «grande» è…',1,['piccolo']),textQ('Il contrario di «facile» è…',1,['difficile']),textQ('Il contrario di «vicino» è…',1,['lontano'])]},
  {...createSection('Compléter les phrases',20),instructions:'Completa ogni frase con la forma corretta.',questions:[
   textQ('Io ___ studente.',2,['sono']),textQ('Tu ___ un libro.',2,['hai']),textQ('Noi ___ a scuola.',2,['andiamo']),textQ('Lei ___ a Roma.',2,['vive']),textQ('Loro ___ italiano.',2,['parlano']),textQ('Voi ___ amici.',2,['siete']),textQ('Lui ___ colazione.',2,['fa']),textQ('Io ___ il treno.',2,['prendo']),textQ('Noi ___ una casa.',2,['abbiamo']),textQ('Tu ___ italiano.',2,['studi'])
  ]}
 ]
};
export function getWrittenExamTotals(exam:Pick<WrittenExam,'sections'|'display_scale'>){
 const raw=exam.sections.reduce((sum,s)=>sum+s.questions.reduce((n,q)=>n+Math.max(0,Number(q.points)||0),0),0);
 const planned=exam.sections.reduce((sum,s)=>sum+Math.max(0,Number(s.points)||0),0);
 return {raw,planned,normalizedMaximum:exam.display_scale};
}
export function validateWrittenExam(exam:WrittenExam):string[]{
 const errors:string[]=[];
 if(!exam.title.trim())errors.push('Le titre est obligatoire.');
 if(!Number.isInteger(exam.duration_minutes)||exam.duration_minutes<1)errors.push('La durée doit être supérieure à zéro.');
 if(!exam.class_ids.length)errors.push('Sélectionnez au moins une classe.');
 if(!exam.sections.length)errors.push('Ajoutez au moins une section.');
 if(exam.max_attempts<1||exam.max_attempts>10)errors.push('Le nombre de tentatives doit être compris entre 1 et 10.');
 if(exam.opens_at&&exam.closes_at&&new Date(exam.closes_at)<=new Date(exam.opens_at))errors.push('La fermeture doit être postérieure à l’ouverture.');
 exam.sections.forEach((s,i)=>{
  if(!s.title.trim())errors.push('Section '+(i+1)+' : titre manquant.');
  if(!s.questions.length)errors.push('Section « '+s.title+' » : ajoutez au moins une question.');
  if((s.support_text||'').includes('{{'))errors.push('Section « '+s.title+' » : remplacez le texte-support de démonstration.');
  if(s.support_url&&!/^https?:\/\//i.test(s.support_url))errors.push('Section « '+s.title+' » : le document support doit utiliser HTTP ou HTTPS.');
  const points=s.questions.reduce((n,q)=>n+Number(q.points||0),0);
  if(s.points>0&&points>s.points)errors.push('Section « '+s.title+' » : '+points+' points dépassent le plafond de '+s.points+'.');
  s.questions.forEach((q,j)=>{
   if(!q.prompt.trim()||q.prompt.includes('{{'))errors.push('Question '+(j+1)+' de « '+s.title+' » : énoncé manquant ou canevas à compléter.');
   if(!Number.isFinite(q.points)||q.points<=0)errors.push('Question '+(j+1)+' : barème invalide.');
   if(q.type==='qcm'&&((q.options||[]).length<2||(!q.manual_review&&(!q.answer_key.correctOptionId||(q.options||[]).every(o=>o.id!==q.answer_key.correctOptionId)))))errors.push('QCM '+(j+1)+' : options ou bonne réponse manquante.');
   if(q.type==='text'&&!q.manual_review&&!(q.answer_key.acceptedAnswers?.length||q.answer_key.answers?.length))errors.push('Question texte '+(j+1)+' : ajoutez une réponse acceptée ou activez la correction manuelle.');
   if(q.type==='reorder'&&((q.items||[]).length<2||(!q.manual_review&&(q.answer_key.correctOrder||[]).length!==(q.items||[]).length)))errors.push('Réordonnement '+(j+1)+' : définissez l’ordre attendu de chaque élément.');
   if(q.type==='verbes_trous'&&q.manual_review)errors.push('Question '+(j+1)+' : les verbes à trous sont corrigés automatiquement; désactivez la correction manuelle.');
   if(q.type==='verbes_trous'){const d=q.verbes_trous;const keys=q.answer_key.phrases||[];const bank=d?.banque||[];const phrases=d?.phrases||[];if(!d||phrases.length<1||bank.length<phrases.length)errors.push('Question '+(j+1)+' : la banque doit contenir au moins autant de verbes que de phrases.');if(new Set(bank.map(v=>v.trim().toLocaleLowerCase('it-IT'))).size!==bank.length)errors.push('Question '+(j+1)+' : la banque contient des doublons.');if(new Set(keys.map(p=>String(p.verbe||'').trim().toLocaleLowerCase('it-IT'))).size!==keys.length)errors.push('Question '+(j+1)+' : chaque phrase doit avoir un verbe attendu différent.');if(keys.length!==phrases.length||keys.some(p=>!String(p.verbe||'').trim()||!p.reponses?.some(a=>String(a||'').trim())))errors.push('Question '+(j+1)+' : chaque phrase doit avoir un verbe attendu et au moins une conjugaison acceptée.');if(keys.some(p=>!bank.some(v=>v.trim().toLocaleLowerCase('it-IT')===String(p.verbe||'').trim().toLocaleLowerCase('it-IT'))))errors.push('Question '+(j+1)+' : un verbe attendu est absent de la banque.');if(Number(q.points)!==phrases.length*3)errors.push('Question '+(j+1)+' : le barème doit être de 3 points par phrase.');}
  });
 });
 const total=getWrittenExamTotals(exam).raw;
 if(total<=0)errors.push('Le barème des questions doit être supérieur à zéro.');
 return errors;
}
export function applyWrittenExamOrder(sections:any[],manifest:WrittenOrderManifest):any[]{
 const byId=new Map(sections.map(s=>[s.id,s]));
 const sectionIds=manifest?.sections||sections.map(s=>s.id);
 return sectionIds.map(id=>byId.get(id)).filter(Boolean).map(section=>{
  const questionById=new Map((section.questions||[]).map((q:any)=>[q.id,q]));
  const ids=manifest?.questions?.[section.id]||Array.from(questionById.keys());
  return {...section,questions:ids.map((id:string)=>questionById.get(id)).filter(Boolean).map((q:any)=>{
   const optionsById=new Map((q.public_data?.options||[]).map((o:any)=>[o.id,o]));
   const optionIds=manifest?.options?.[q.id]||Array.from(optionsById.keys());
   const itemById=new Map((q.public_data?.items||[]).map((it:any)=>[it.id,it]));
   const itemIds=manifest?.items?.[q.id]||Array.from(itemById.keys());
   return {...q,options:optionIds.map((id:string)=>optionsById.get(id)).filter(Boolean),items:itemIds.map((id:string)=>itemById.get(id)).filter(Boolean)};
  })};
 });
}
