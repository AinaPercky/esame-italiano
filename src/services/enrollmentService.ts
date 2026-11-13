import { supabaseService } from './supabaseService';

export type EnrollmentMode = 'direct' | 'approval';
export type EnrollmentStatus = 'active' | 'suspended' | 'completed' | 'abandoned' | 'expelled';
export interface ClassEnrollment {
  id: string; student_id: string; class_id: string; status: EnrollmentStatus;
  source: 'admin'|'self_service'|'approved_request'|'legacy'; started_at: string; ended_at: string|null;
  student?: { id:string; first_name:string; last_name:string; email:string; student_number?:string|null };
  class?: { id:string; name:string; enrollment_mode:EnrollmentMode };
}
export interface ClassEnrollmentRequest {
  id:string; student_id:string; class_id:string; status:'pending'|'approved'|'rejected'|'cancelled';
  requested_at:string; reviewed_at?:string|null; review_note?:string|null;
  student?:{id:string;first_name:string;last_name:string;email:string};
  class?:{id:string;name:string;enrollment_mode:EnrollmentMode};
}
export interface AvailableClass { id:string; name:string; enrollment_mode:EnrollmentMode; archived_at?:string|null; }
function client(){const c=supabaseService.getClient();if(!c)throw new Error('Connexion Supabase indisponible.');return c;}
function check(error:{message:string}|null,context:string){if(error)throw new Error(`${context} : ${error.message}`);}
export const enrollmentService={
 async listMyEnrollments(studentId:string):Promise<ClassEnrollment[]>{
  if(!studentId)return [];
  const {data,error}=await client().from('class_enrollments').select('id,student_id,class_id,status,source,started_at,ended_at,class:classes(id,name,enrollment_mode)').eq('student_id',studentId).order('started_at',{ascending:false});
  check(error,'Chargement des classes impossible');return (data||[]) as unknown as ClassEnrollment[];
 },
 async listAvailableClasses():Promise<AvailableClass[]>{
  const {data,error}=await client().from('classes').select('id,name,enrollment_mode,archived_at').is('archived_at',null).order('name');
  check(error,'Chargement des classes disponibles impossible');return (data||[]) as AvailableClass[];
 },
 async listMyRequests(studentId:string):Promise<ClassEnrollmentRequest[]>{
  if(!studentId)return [];
  const {data,error}=await client().from('class_enrollment_requests').select('id,student_id,class_id,status,requested_at,reviewed_at,review_note,class:classes(id,name,enrollment_mode)').eq('student_id',studentId).order('requested_at',{ascending:false});
  check(error,'Chargement des demandes impossible');return (data||[]) as unknown as ClassEnrollmentRequest[];
 },
 async requestClassEnrollment(classId:string):Promise<{status:'active'|'pending';request_id?:string}>{
  const {data,error}=await client().rpc('request_class_enrollment',{p_class_id:classId});check(error,'Inscription impossible');return data as {status:'active'|'pending';request_id?:string};
 },
 async listAllEnrollments():Promise<ClassEnrollment[]>{
  const {data,error}=await client().from('class_enrollments').select('id,student_id,class_id,status,source,started_at,ended_at,student:students(id,first_name,last_name,email,student_number),class:classes(id,name,enrollment_mode)').order('started_at',{ascending:false});
  check(error,'Chargement des affectations impossible');return (data||[]) as unknown as ClassEnrollment[];
 },
 async listAllRequests():Promise<ClassEnrollmentRequest[]>{
  const {data,error}=await client().from('class_enrollment_requests').select('id,student_id,class_id,status,requested_at,reviewed_at,review_note,student:students(id,first_name,last_name,email),class:classes(id,name,enrollment_mode)').order('requested_at',{ascending:false});
  check(error,'Chargement des demandes impossible');return (data||[]) as unknown as ClassEnrollmentRequest[];
 },
 async enrollStudent(studentId:string,classId:string):Promise<void>{
  const {error}=await client().from('class_enrollments').insert({student_id:studentId,class_id:classId,status:'active',source:'admin'});check(error,'Ajout de l’élève impossible');
 },
 async setStatus(id:string,status:EnrollmentStatus,endedBy?:string):Promise<void>{
  const open=status==='active'||status==='suspended';
  const {error}=await client().from('class_enrollments').update({status,ended_at:open?null:new Date().toISOString(),ended_by:open?null:endedBy||null,updated_at:new Date().toISOString()}).eq('id',id);
  check(error,'Mise à jour de l’inscription impossible');
 },
 async reviewRequest(id:string,decision:'approved'|'rejected'):Promise<void>{
  const {error}=await client().rpc('review_class_enrollment_request',{p_request_id:id,p_decision:decision,p_note:null});check(error,'Traitement de la demande impossible');
 }
};
