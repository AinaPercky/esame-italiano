const MAX_AVATAR_BYTES = 200 * 1024; // 200 Ko — seuil max absolu
const MAX_AVATAR_DIMENSION = 512;

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Impossible de compresser cette image.'));
      }
    }, 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire la photo compressée.'));
      }
    };
    reader.onerror = () => reject(new Error('Impossible de lire la photo compressée.'));
    reader.readAsDataURL(blob);
  });
}

export async function compressAvatarImage(image: HTMLImageElement): Promise<string> {
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Les dimensions de cette image sont invalides.');
  }

  const scale = Math.min(
    1,
    MAX_AVATAR_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  let width = Math.max(1, Math.round(image.naturalWidth * scale));
  let height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponible.');

  for (let dimensionPass = 0; dimensionPass < 8; dimensionPass++) {
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.85, 0.75, 0.62, 0.50, 0.38, 0.25]) {
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= MAX_AVATAR_BYTES) return blobToDataUrl(blob);
    }

    width = Math.max(1, Math.floor(width * 0.8));
    height = Math.max(1, Math.floor(height * 0.8));
  }

  throw new Error('La photo ne peut pas être compressée sous 200 Ko. Essayez une autre image.');
}
