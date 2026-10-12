import React from 'react';
import { AlertCircle, HelpCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'primary',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertCircle className="w-6 h-6 text-rose-600" />,
          btn: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-rose-200',
          badgeBg: 'bg-rose-100 text-rose-800'
        };
      case 'warning':
        return {
          icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
          btn: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-amber-200',
          badgeBg: 'bg-amber-100 text-amber-800'
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
          btn: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-200',
          badgeBg: 'bg-emerald-100 text-emerald-800'
        };
      case 'primary':
      default:
        return {
          icon: <HelpCircle className="w-6 h-6 text-amber-800" />,
          btn: 'bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white shadow-amber-200',
          badgeBg: 'bg-amber-100 text-amber-800'
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-scale-in"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl shrink-0 ${styles.badgeBg}`}>
              {styles.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-lg text-slate-900 leading-snug">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {message}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs sm:text-sm hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
            }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer ${styles.btn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
