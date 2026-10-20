// Image pipeline: load -> edge detection -> perspective crop -> filters (OpenCV.js), OCR (Tesseract.js).

let cvReady = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
    document.head.append(s);
  });
}

export function loadCV() {
  if (!cvReady) {
    cvReady = (async () => {
      await loadScript('lib/opencv.js');
      let c = window.cv;
      if (c && typeof c.then === 'function') {
        // The resolved module itself has a `then`, so awaiting it directly would loop forever; wrap it.
        c = (await new Promise((res) => c.then((m) => res({ m })))).m;
      } else if (!c.Mat) {
        await new Promise((r) => { c.onRuntimeInitialized = r; });
      }
      window.cv = c;
    })();
    cvReady.catch(() => { cvReady = null; });
  }
  return cvReady;
}

export function fileToCanvas(blob, maxDim = 2200) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read image')); };
    img.src = url;
  });
}

export const canvasToBlob = (c, q = 0.85) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));

const fullRect = (c, inset = 0.04) => {
  const x = c.width * inset, y = c.height * inset;
  return [{ x, y }, { x: c.width - x, y }, { x: c.width - x, y: c.height - y }, { x, y: c.height - y }];
};
export { fullRect };

function order(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]]; // tl, tr, br, bl
}

/** Returns 4 corners (tl,tr,br,bl) in canvas pixels; falls back to an inset rectangle. */
export function detectCorners(canvas) {
  const cv = window.cv;
  const s = Math.min(1, 600 / Math.max(canvas.width, canvas.height));
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * s);
  small.height = Math.round(canvas.height * s);
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);

  const src = cv.imread(small), gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
  const cnts = new cv.MatVector(), hier = new cv.Mat();
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  let best = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 50, 150);
    cv.dilate(edges, edges, k);
    cv.findContours(edges, cnts, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    let bestArea = small.width * small.height * 0.15;
    for (let i = 0; i < cnts.size(); i++) {
      const c = cnts.get(i);
      const area = cv.contourArea(c);
      if (area > bestArea) {
        const ap = new cv.Mat();
        cv.approxPolyDP(c, ap, 0.02 * cv.arcLength(c, true), true);
        if (ap.rows === 4 && cv.isContourConvex(ap)) {
          best = [0, 1, 2, 3].map((j) => ({ x: ap.data32S[j * 2] / s, y: ap.data32S[j * 2 + 1] / s }));
          bestArea = area;
        }
        ap.delete();
      }
      c.delete();
    }
  } finally {
    [src, gray, blur, edges, hier, k].forEach((m) => m.delete());
    cnts.delete();
  }
  return best ? order(best) : fullRect(canvas);
}

/** Perspective-correct the quad (tl,tr,br,bl) into an upright rectangle. */
export function warp(canvas, [tl, tr, br, bl]) {
  const cv = window.cv;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = Math.max(40, Math.round(Math.max(d(tl, tr), d(bl, br))));
  const h = Math.max(40, Math.round(Math.max(d(tl, bl), d(tr, br))));
  const src = cv.imread(canvas), dst = new cv.Mat();
  const sm = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dm = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const M = cv.getPerspectiveTransform(sm, dm);
  const out = document.createElement('canvas');
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    cv.imshow(out, dst);
  } finally {
    [src, dst, sm, dm, M].forEach((m) => m.delete());
  }
  return out;
}

export function rotate90(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.height; out.height = canvas.width;
  const x = out.getContext('2d');
  x.translate(out.width / 2, out.height / 2);
  x.rotate(Math.PI / 2);
  x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

export const FILTERS = ['Original', 'Magic', 'Grayscale', 'B&W', 'Enhance'];

export function applyFilter(canvas, name) {
  if (name === 'Original') return canvas;
  const cv = window.cv;
  const src = cv.imread(canvas), gray = new cv.Mat(), tmp = new cv.Mat(), dst = new cv.Mat();
  const out = document.createElement('canvas');
  try {
    if (name === 'Enhance') {
      cv.convertScaleAbs(src, dst, 1.25, 8);
    } else {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      if (name === 'Grayscale') {
        gray.copyTo(dst);
      } else {
        // Divide by a heavily blurred copy to flatten shadows and lighting (the "scanned" look).
        const k = (Math.round(Math.max(canvas.width, canvas.height) / 40) | 1) + 0;
        cv.GaussianBlur(gray, tmp, new cv.Size(k, k), 0);
        cv.divide(gray, tmp, dst, 255);
        if (name === 'B&W') {
          const bin = new cv.Mat();
          cv.threshold(dst, bin, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
          bin.copyTo(dst); bin.delete();
        } else {
          cv.convertScaleAbs(dst, dst, 1.15, -10);
        }
      }
    }
    cv.imshow(out, dst);
  } finally {
    [src, gray, tmp, dst].forEach((m) => m.delete());
  }
  return out;
}

// ---- OCR -----------------------------------------------------------------

let ocrWorker = null;
const abs = (p) => new URL(p, document.baseURI).href;

export async function ocr(canvases, onProgress) {
  if (!window.Tesseract) await loadScript('lib/tess/tesseract.min.js');
  if (!ocrWorker) {
    ocrWorker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: abs('lib/tess/worker.min.js'),
      corePath: abs('lib/tess/'),
      langPath: abs('lib/tess/lang'),
      workerBlobURL: false,
    });
  }
  const texts = [];
  for (let i = 0; i < canvases.length; i++) {
    onProgress?.(i + 1, canvases.length);
    const { data } = await ocrWorker.recognize(canvases[i]);
    texts.push(data.text.trim());
  }
  return texts.join('\n\n');
}
