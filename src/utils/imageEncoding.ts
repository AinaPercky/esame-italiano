function encodeJpegFallback(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const jpegCanvas = document.createElement('canvas');
  jpegCanvas.width = canvas.width;
  jpegCanvas.height = canvas.height;
  const context = jpegCanvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas indisponible.'));

  // JPEG ne gère pas la transparence : conserver les images lisibles sur fond blanc.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  context.drawImage(canvas, 0, 0);

  return new Promise((resolve, reject) => {
    jpegCanvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Impossible d’encoder cette image en JPEG.'));
    }, 'image/jpeg', quality);
  });
}

/** Encode un canvas en WebP; utilise JPEG uniquement si le navigateur ne sait pas produire du WebP. */
export function canvasToWebpOrJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Impossible d’encoder cette image.'));
        return;
      }

      if (blob.type === 'image/webp') {
        resolve(blob);
        return;
      }

      encodeJpegFallback(canvas, quality).then(resolve, reject);
    }, 'image/webp', quality);
  });
}
