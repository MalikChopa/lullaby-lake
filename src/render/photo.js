// Photo mode export: the scene picture WITHOUT the page interface, enlarged by a whole number (nearest neighbour, no blur) and saved
// as a PNG through the browser's own download. Nothing is sent anywhere. The file name carries the local date and time only.

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** lullaby-lake-YYYYMMDD-HHMMSS.png from the LOCAL clock of `d` (a Date): no seed, no path, nothing personal. */
export function photoFileName(d) {
  return `lullaby-lake-${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

/** A new canvas holding `source` enlarged `scale` times, pixel for pixel (smoothing off). */
export function enlarge(source, scale, doc = document) {
  const c = doc.createElement('canvas');
  c.width = source.width * scale;
  c.height = source.height * scale;
  const ctx = c.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/**
 * Saves the picture. Resolves { name, width, height } once the download was started ; rejects when the PNG could not be made.
 * @param {{ source: HTMLCanvasElement, scale: number, date: Date, doc?: Document }} o
 */
export function savePhoto({ source, scale, date, doc = document }) {
  const big = enlarge(source, scale, doc);
  const name = photoFileName(date);
  return new Promise((resolve, reject) => {
    big.toBlob((blob) => {
      if (!blob) {
        reject(new Error('no PNG'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      a.style.display = 'none';
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      resolve({ name, width: big.width, height: big.height });
    }, 'image/png');
  });
}
