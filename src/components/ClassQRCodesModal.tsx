import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  X, 
  Printer, 
  Users, 
  BookOpen, 
  Sparkles,
  Download,
  CheckCircle2
} from 'lucide-react';
import { Student, Exam, Evaluation } from '../types';
import { dataService } from '../services/dataService';

interface ClassQRCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Exam;
  students: Student[];
}

interface StudentQRItem {
  student: Student;
  evaluation?: Evaluation;
  qrUrl: string;
  reportUrl: string;
}

export const ClassQRCodesModal: React.FC<ClassQRCodesModalProps> = ({
  isOpen,
  onClose,
  exam,
  students
}) => {
  const [qrItems, setQrItems] = useState<StudentQRItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const baseUrl = window.location.origin + window.location.pathname;

    const generateAll = async () => {
      const items: StudentQRItem[] = [];

      for (const st of students) {
        const evals = dataService.getEvaluations(exam.id, undefined, st.id);
        const reportUrl = `${baseUrl}?view=student&exam=${encodeURIComponent(exam.id)}&student=${encodeURIComponent(st.id)}`;
        
        try {
          const qrUrl = await QRCode.toDataURL(reportUrl, {
            width: 200,
            margin: 1,
            color: { dark: '#1e293b', light: '#ffffff' },
            errorCorrectionLevel: 'M'
          });
          items.push({
            student: st,
            evaluation: evals[0],
            qrUrl,
            reportUrl
          });
        } catch (e) {
          console.error(e);
        }
      }

      setQrItems(items);
      setLoading(false);
    };

    generateAll();
  }, [isOpen, exam, students]);

  const handlePrintAll = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-900 to-amber-800 px-6 py-4 text-white flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg">
                Planche des Codes QR de la Classe ({students.length} élèves)
              </h2>
              <p className="text-xs text-amber-200/90">
                {exam.title} • {exam.class_name || 'Classe'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer les badges QR</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-amber-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Printable Grid */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <p className="text-xs text-slate-500 no-print">
            Chaque élève peut scanner son Code QR personnel pour consulter sa fiche d'examen, ses résultats, la grille détaillée et les remarques.
          </p>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <span>Génération des Codes QR en cours...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {qrItems.map(({ student, evaluation, qrUrl }) => (
                <div
                  key={student.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center text-center space-y-2.5 shadow-2xs break-inside-avoid print:bg-white print:border-slate-300"
                >
                  <div className="w-full">
                    <span className="text-[9px] uppercase font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                      Esame Orale d'Italien
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1 truncate">
                      {student.first_name} {student.last_name}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {student.student_number || 'Sans matricule'}
                    </p>
                  </div>

                  <img
                    src={qrUrl}
                    alt={`QR Code ${student.first_name} ${student.last_name}`}
                    className="w-36 h-36 rounded-lg border border-slate-200 bg-white p-1 shadow-2xs"
                  />

                  <div className="w-full border-t border-slate-200/80 pt-2 space-y-0.5">
                    {evaluation ? (
                      <div className="text-xs font-semibold text-emerald-800 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Note : {evaluation.total_score}/10</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                        Épreuve à venir
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
