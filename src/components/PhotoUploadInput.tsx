import React, { useState, useRef } from 'react';
import { Upload, Trash2, ImagePlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { StudentAvatar } from './StudentAvatar';

interface PhotoUploadInputProps {
  value?: string | null;
  name?: string;
  onChange: (photoDataUrl: string) => void;
  onRemove?: () => void;
  label?: string;
  helperText?: string;
}

/**
 * Compresse une image côté client via un canvas HTML5
 * Dimensions max: 400x400 (parfait pour avatar)
 * Sortie: data URL JPEG optimisée (< 200 Ko)
 */
export async function compressAvatarFile(file: File, maxDim = 400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("L'image d'origine ne doit pas dépasser 8 Mo."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Impossible de charger l'image."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Impossible de traiter le canvas graphique.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const PhotoUploadInput: React.FC<PhotoUploadInputProps> = ({
  value,
  name = 'Élève',
  onChange,
  onRemove,
  label = 'Photo de profil',
  helperText = 'Glissez une image ou cliquez pour parcourir (JPG, PNG ou WebP, max 8 Mo).'
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setError(null);
    setSuccess(null);
    setIsProcessing(true);

    try {
      const compressedDataUrl = await compressAvatarFile(file);
      onChange(compressedDataUrl);
      setSuccess('Photo prête à être enregistrée');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de traitement de la photo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemove = () => {
    setError(null);
    setSuccess(null);
    if (onRemove) {
      onRemove();
    } else {
      onChange('');
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-3 sm:p-4 transition-all duration-200 flex flex-col sm:flex-row items-center gap-4 ${
          isDragging
            ? 'border-amber-600 bg-amber-50/80 scale-[1.01]'
            : 'border-slate-200 hover:border-amber-400 bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Téléverser une photo"
        />

        {/* Aperçu du profil */}
        <div className="relative group shrink-0">
          <StudentAvatar
            name={name}
            src={value || undefined}
            className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-white shadow-xs text-lg"
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
              ...
            </div>
          )}
        </div>

        {/* Zone de contrôle / Téléversement */}
        <div className="flex-1 text-center sm:text-left space-y-2 w-full">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors min-h-[36px]"
            >
              {value ? <ImagePlus className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{value ? 'Remplacer la photo' : 'Télécharger une photo'}</span>
            </button>

            {value && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-rose-300 transition-colors min-h-[36px]"
                title="Supprimer la photo de profil"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            {helperText}
          </p>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium pt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
