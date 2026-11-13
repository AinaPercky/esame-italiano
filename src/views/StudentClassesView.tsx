import React,{useCallback,useEffect,useState} from 'react';
import {Clock3,GraduationCap,Loader2,PlusCircle,RefreshCw} from 'lucide-react';
import {enrollmentService,ClassEnrollment,ClassEnrollmentRequest,AvailableClass} from '../services/enrollmentService';
export const StudentClassesView:React.FC<{studentId:string;onEnrollmentsChanged?:()=>void}>=({studentId,onEnrollmentsChanged})=>{
 const [enrollments,setEnrollments]=useState<ClassEnrollment[]>([]);
 const [requests,setRequests]=useState<ClassEnrollmentRequest[]>([]);
 const [available,setAvailable]=useState<AvailableClass[]>([]);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  if(!studentId){setError('Votre compte n’est pas associé à une fiche élève.');setLoading(false);return;}
  setLoading(true);setError(null);
  try{const [e,r,c]=await Promise.all([enrollmentService.listMyEnrollments(studentId),enrollmentService.listMyRequests(studentId),enrollmentService.listAvailableClasses()]);setEnrollments(e);setRequests(r);setAvailable(c);}
  catch(e){setError(e instanceof Error?e.message:'Chargement impossible.');}finally{setLoading(false);}
 },[studentId]);
 useEffect(()=>{void refresh();},[refresh]);
 const join=async(id:string)=>{setWorking(id);setError(null);setMessage(null);try{const result=await enrollmentService.requestClassEnrollment(id);setMessage(result.status==='active'?'Vous avez rejoint cette classe.':'Votre demande a été envoyée à l’administration.');await refresh();onEnrollmentsChanged?.();}catch(e){setError(e instanceof Error?e.message:'Inscription impossible.');}finally{setWorking(null);}};
 const open=enrollments.filter(e=>e.status==='active'||e.status==='suspended');
 const joined=new Set(open.map(e=>e.class_id));
 const pending=new Set(requests.filter(r=>r.status==='pending').map(r=>r.class_id));
 const labels:Record<string,string>={active:'Active',suspended:'Suspendue',completed:'Terminée',abandoned:'Abandonnée',expelled:'Expulsée'};
 return <div className="mx-auto w-full max-w-5xl space-y-6">
  <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#2fa36b]">Espace étudiant</p><h2 className="font-display text-2xl font-extrabold text-[#072a3f]">Mes classes</h2><p className="mt-1 text-sm text-slate-600">Consultez vos inscriptions et rejoignez une nouvelle classe sans créer un autre compte.</p></div><button onClick={()=>void refresh()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold"><RefreshCw className="h-4 w-4"/>Actualiser</button></header>
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
  {message&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
  {loading?<div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-5 w-5 animate-spin"/>Chargement…</div>:<>
   <section className="space-y-3"><h3 className="font-bold text-[#072a3f]">Mes inscriptions</h3>{enrollments.length===0?<p className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-500">Aucune inscription enregistrée.</p>:<div className="grid gap-3 sm:grid-cols-2">{enrollments.map(e=><article key={e.id} className="rounded-2xl border bg-white p-4"><div className="flex justify-between gap-3"><strong className="text-[#072a3f]">{e.class?.name||'Classe'}</strong><span className="text-xs font-bold text-slate-600">{labels[e.status]}</span></div><p className="mt-2 text-xs text-slate-500">Depuis le {new Date(e.started_at).toLocaleDateString('fr-FR')}</p></article>)}</div>}</section>
   {requests.some(r=>r.status==='pending')&&<section className="space-y-2"><h3 className="font-bold text-[#072a3f]">Demandes en attente</h3>{requests.filter(r=>r.status==='pending').map(r=><div key={r.id} className="flex justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong>{r.class?.name||'Classe'}</strong><span className="inline-flex items-center gap-1 text-xs text-amber-800"><Clock3 className="h-4 w-4"/>En attente</span></div>)}</section>}
   <section className="space-y-3"><div><h3 className="font-bold text-[#072a3f]">Classes disponibles</h3><p className="text-xs text-slate-500">Le mode d’inscription est défini individuellement pour chaque classe.</p></div>{available.length===0?<p className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-500">Aucune classe disponible.</p>:<div className="grid gap-3 sm:grid-cols-2">{available.map(c=>{const disabled=joined.has(c.id)||pending.has(c.id)||working===c.id;return <article key={c.id} className="flex flex-col justify-between gap-3 rounded-2xl border bg-white p-4"><div><strong className="text-[#072a3f]">{c.name}</strong><p className="mt-1 text-xs text-slate-500">{c.enrollment_mode==='direct'?'Inscription immédiate':'Demande soumise à validation'}</p></div><button onClick={()=>void join(c.id)} disabled={disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 text-sm font-bold text-white disabled:opacity-50">{working===c.id?<Loader2 className="h-4 w-4 animate-spin"/>:c.enrollment_mode==='direct'?<PlusCircle className="h-4 w-4"/>:<GraduationCap className="h-4 w-4"/>}{joined.has(c.id)?'Déjà inscrit':pending.has(c.id)?'Demande envoyée':c.enrollment_mode==='direct'?'Rejoindre la classe':'Demander à rejoindre'}</button></article>;})}</div>}</section>
  </>}
 </div>;
};
