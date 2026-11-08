import { supabaseService } from './supabaseService';
import type { WrittenExam, WrittenAttempt } from '../utils/writtenExam';
function client(){const db=supabaseService.getClient();if(!db)throw new Error('Supabase n’est pas configuré.');return db;}
function unwrap<T>(data:T,error:any):T{if(error)throw new Error(error.message||'Erreur Supabase.');return data;}
export const writtenExamService={
 async saveDefinition(exam:WrittenExam){const {data,error}=await client().rpc('save_written_exam_definition',{p_exam_id:exam.id||null,p_definition:exam});return unwrap<any>(data,error);},
 async publish(examId:string,versionId:string){const {data,error}=await client().rpc('publish_written_exam',{p_exam_id:examId,p_version_id:versionId});return unwrap<any>(data,error);},
 async close(examId:string){const {data,error}=await client().rpc('close_written_exam',{p_exam_id:examId});return unwrap<any>(data,error);},
 async listTeacherExams(){const {data,error}=await client().from('written_exams').select('*,written_exam_classes(class_id),written_exam_versions(id,version_number,status,raw_max,published_at,created_at)').order('created_at',{ascending:false});return unwrap<any[]>(data||[],error);},
 async getDefinition(examId:string){const db=client();const {data:exam,error}=await db.from('written_exams').select('*,written_exam_classes(class_id)').eq('id',examId).single();unwrap(exam,error);const {data:versions,error:versionError}=await db.from('written_exam_versions').select('*,written_exam_sections(*,written_exam_questions(*,written_exam_answer_keys(*)))').eq('exam_id',examId).order('version_number',{ascending:false});unwrap(versions,versionError);return {...exam,class_ids:(exam.written_exam_classes||[]).map((x:any)=>x.class_id),versions};},
 async listAttempts(examId:string){const {data,error}=await client().from('written_exam_attempts').select('*,students(first_name,last_name,student_number),written_exam_section_results(*)').eq('exam_id',examId).order('started_at',{ascending:false});return unwrap<any[]>(data||[],error);},
 async listIntegrityEvents(examId:string){const {data,error}=await client().from('written_exam_integrity_events').select('*,written_exam_attempts!inner(exam_id,student_id,students(first_name,last_name))').eq('written_exam_attempts.exam_id',examId).order('occurred_at',{ascending:false});return unwrap<any[]>(data||[],error);},
 async grade(attemptId:string,manualScores:Record<string,number>){const {data,error}=await client().rpc('grade_written_exam_attempt',{p_attempt_id:attemptId,p_manual_scores:manualScores});return unwrap<any>(data,error);},
 async publishResults(examId:string){const {data,error}=await client().rpc('publish_written_exam_results',{p_exam_id:examId});return unwrap<any>(data,error);},
 async listAvailable(){const {data,error}=await client().rpc('list_available_written_exams');return unwrap<any[]>(data||[],error);},
 async start(examId:string){const {data,error}=await client().rpc('start_written_exam',{p_exam_id:examId});return unwrap<WrittenAttempt>(data,error);},
 async saveAnswers(attemptId:string,answers:Record<string,unknown>){const {data,error}=await client().rpc('save_written_exam_answers',{p_attempt_id:attemptId,p_answers:answers});return unwrap<any>(data,error);},
 async submit(attemptId:string){const {data,error}=await client().rpc('submit_written_exam',{p_attempt_id:attemptId});return unwrap<any>(data,error);},
 async getCorrections(examId:string){const {data,error}=await client().rpc('get_my_written_exam_corrections',{p_exam_id:examId});return unwrap<any[]>(data||[],error);},
 async logIntegrity(attemptId:string,eventType:string,details:Record<string,unknown>={}){const {error}=await client().rpc('log_written_exam_integrity_event',{p_attempt_id:attemptId,p_event_type:eventType,p_details:details});if(error)throw new Error(error.message);}
};
