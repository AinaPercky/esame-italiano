import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  X, 
  Copy, 
  Check, 
  Download, 
  Printer, 
  ExternalLink, 
  Sparkles,
  Smartphone,
  User,
  BookOpen
} from 'lucide-react';
import { Student, Exam, Evaluation } from '../types';

interface StudentQRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  exam: Exam;
  evaluation?: Evaluation;
}

export const StudentQRCodeModal: React.FC<StudentQRCodeModalProps> = ({
  isOpen,
  onClose,
  student,
  exam,
  evaluation
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Construire l'URL publique de consultation pour l'élève
  const baseUrl = window.location.origin + window.location.pathname;
  const studentReportUrl = `${baseUrl}?view=student&exam=${encodeURIComponent(exam.id)}&student=${encodeURIComponent(student.id)}`;

  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(studentReportUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Erreur génération QR Code:', err));
  }, [isOpen, studentReportUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(studentReportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Erreur copie presse-papier:', e);
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QRCode_Oral_Italien_${student.first_name}_${student.last_name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintCard = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-900 to-amber-800 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-300" />
            <span className="font-display font-bold text-base">
              Code QR de l'Élève
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-amber-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-center">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
              Fiche officielle en lecture seule
            </span>
            <h3 className="font-display text-xl font-bold text-slate-900 mt-1">
              {student.first_name} {student.last_name}
            </h3>
            <p className="text-xs text-slate-500">
              {exam.title} • {exam.class_name || 'Classe'}
            </p>
            {evaluation?.presented_animal && (
              <p className="text-xs font-semibold text-amber-800 mt-1">
                🐾 Animal présenté : « {evaluation.presented_animal} »
              </p>
            )}
          </div>

          {/* QR Code Image Card */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block shadow-inner">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Code QR pour ${student.first_name} ${student.last_name}`}
                className="w-56 h-56 mx-auto rounded-lg shadow-xs"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                <span>Génération du Code QR...</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2 flex items-center justify-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              <span>Scannez avec l'appareil photo d'un smartphone</span>
            </p>
          </div>

          {/* Quick Copy Link Box */}
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-semibold text-slate-700 block">
              Lien direct de consultation élève :
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={studentReportUrl}
                className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700 truncate select-all"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors shrink-0 cursor-pointer"
                title="Copier le lien"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handlePrintCard}
              className="flex flex-col items-center justify-center gap-1 p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Imprimer badge</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadQR}
              className="flex flex-col items-center justify-center gap-1 p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Télécharger image</span>
            </button>

            <a
              href={studentReportUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center gap-1 p-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl border border-amber-200 text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-amber-700" />
              <span>Tester la vue</span>
            </a>
          </div>

        </div>

      </div>
    </div>
  );
};
