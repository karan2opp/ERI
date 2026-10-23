/** The longest side a picture is sent at (the server stores them at 1200 px anyway). */
const MAX_SIDE = 1600;

/** The kinds of picture the server takes as they are. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * A phone photo made smaller before it is uploaded (a JPEG at most 1600 px on its longest side), so sending a few
 * of them on mobile data is quick. Other kinds the browser can read (such as HEIC on some phones) become JPEGs too.
 * Pictures that are already small, or that the browser can't read, go as they are.
 */
export async function shrinkImage(file: File): Promise<File> {
  const accepted = ACCEPTED.includes(file.type);
  if (accepted && file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no see-through parts: white behind them, not black
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || (accepted && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
