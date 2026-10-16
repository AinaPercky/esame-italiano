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

const TARGET_MIN_BYTES = 50 * 1024;   //  50 Ko — seuil min pour garder une qualité acceptable
const TARGET_MAX_BYTES = 200 * 1024;  // 200 Ko — seuil max absolu

/**
 * Compresse une image côté client via un canvas HTML5.
 * Utilise une bisection sur la qualité JPEG (puis réduit les dimensions si nécessaire)
 * pour cibler une taille finale entre 50 Ko et 200 Ko.
 * @param file       Fichier image source (JPG, PNG, WebP…)
 * @param maxDim     Dimension max en pixels (côté le plus long). Défaut : 512 px.
 */
export async function compressAvatarFile(file: File, maxDim = 512): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("L'image d'origine ne doit pas dépasser 8 Mo.");
  }

  // --- 1. Chargement de l'image ------------------------------------------
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error("Impossible de charger l'image."));
    el.onload = () => resolve(el);
    el.src = dataUrl;
  });

  // --- 2. Redimensionnement initial proportionnel -------------------------
  const scaleFactor = Math.min(1, maxDim / Math.max(img.width, img.height));
  let width  = Math.max(1, Math.round(img.width  * scaleFactor));
  let height = Math.max(1, Math.round(img.height * scaleFactor));

  // Helper : encode le canvas en blob JPEG à la qualité donnée
  const encodeJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
    new Promise((resolve, reject) =>
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Encodage JPEG impossible.'))),
        'image/jpeg',
        quality
      )
    );

  // Helper : blob → data URL
  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Impossible de lire la photo compressée.'));
      reader.onload  = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

  // --- 3. Boucle externe : réduction dimensionnelle si nécessaire ----------
  for (let dimPass = 0; dimPass < 6; dimPass++) {
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // --- 4. Bisection sur la qualité JPEG (≤ 10 itérations) ---------------
    let qLow = 0.10, qHigh = 0.92;
    let bestBlob: Blob | null = null;

    for (let iter = 0; iter < 10; iter++) {
      const qMid = (qLow + qHigh) / 2;
      const blob = await encodeJpeg(canvas, qMid);

      if (blob.size <= TARGET_MAX_BYTES) {
        bestBlob = blob;     // candidat valide (≤ 200 Ko)
        qLow = qMid;         // on peut monter la qualité
      } else {
        qHigh = qMid;        // trop lourd → baisser la qualité
      }

      // Convergence suffisante
      if (qHigh - qLow < 0.01) break;
    }

    // Si on a un blob valide ≤ 200 Ko, on le retourne
    if (bestBlob) {
      // S'il est en-dessous du seuil min (image très légère de base), on accepte quand même
      return blobToDataUrl(bestBlob);
    }

    // Pas de blob valide : réduire encore les dimensions de 20 % et réessayer
    width  = Math.max(1, Math.floor(width  * 0.80));
    height = Math.max(1, Math.floor(height * 0.80));
  }

  throw new Error(
    `La photo ne peut pas être compressée sous ${TARGET_MAX_BYTES / 1024} Ko. Essayez une image plus petite.`
  );
}


export const PhotoUploadInput: React.FC<PhotoUploadInputProps> = ({
  value,
  name = 'Élève',
  onChange,
  onRemove,
  label = 'Photo de profil',
  helperText = 'Glissez une image ou cliquez pour parcourir (JPG, PNG ou WebP, max 8 Mo). La photo sera automatiquement compressée entre 50 et 200 Ko.'
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

      // Calculer la taille approximative du résultat (base64 → bytes)
      const base64Data = compressedDataUrl.split(',')[1] ?? '';
      const approxBytes = Math.round((base64Data.length * 3) / 4);
      const approxKo = Math.round(approxBytes / 1024);
      setSuccess(`Photo compressée (≈ ${approxKo} Ko) — prête à être enregistrée`);
      setTimeout(() => setSuccess(null), 4000);
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
