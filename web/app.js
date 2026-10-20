import * as S from './store.js';
import * as V from './vision.js';

const app = document.getElementById('app');
const PIN_LEN = 6;
const AUTOLOCK_MS = 15000;

// ---- tiny DOM helpers -----------------------------------------------------

const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(e.style, v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
};

let urls = [];
const objUrl = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
function mount(...nodes) {
  urls.forEach(URL.revokeObjectURL); urls = [];
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

const toastEl = document.getElementById('toast');
let toastT;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

const busyEl = document.getElementById('busy');
const nextPaint = () => new Promise((r) => setTimeout(r, 30));
async function busy(msg, fn) {
  document.getElementById('busyMsg').textContent = msg;
  busyEl.hidden = false;
  await nextPaint();
  try { return await fn((m) => { document.getElementById('busyMsg').textContent = m; }); }
  finally { busyEl.hidden = true; }
}

const icon = (d) => h('span', { class: 'ico', 'aria-hidden': 'true' }, d);

// ---- PIN lock -------------------------------------------------------------

function throttleLeft() {
  return Math.max(0, Number(localStorage.getItem('sp_until') || 0) - Date.now());
}

function lockView() {
  const setup = !S.hasPin();
  let pin = '', first = null, working = false;
  const title = h('h1');
  const sub = h('p', { class: 'muted' });
  const dots = h('div', { class: 'dots' });
  const msg = h('p', { class: 'err', role: 'alert' });

  const paint = () => {
    title.textContent = setup ? (first ? 'Confirm your PIN' : 'Create a PIN') : 'ScanPro is locked';
    sub.textContent = setup
      ? (first ? 'Enter the same 6 digits again.' : 'Choose 6 digits. It encrypts your scans on this device. There is no recovery.')
      : 'Enter your 6-digit PIN';
    dots.replaceChildren(...Array.from({ length: PIN_LEN }, (_, i) => h('i', { class: i < pin.length ? 'on' : '' })));
  };

  async function submit() {
    working = true;
    try {
      if (setup) {
        if (!first) { first = pin; pin = ''; return; }
        if (first !== pin) { msg.textContent = 'PINs did not match. Start again.'; first = null; pin = ''; return; }
        await busy('Securing…', () => S.setupPin(pin));
        return showLibrary();
      }
      const wait = throttleLeft();
      if (wait) { msg.textContent = `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`; pin = ''; return; }
      const ok = await busy('Unlocking…', () => S.unlock(pin));
      if (ok) {
        localStorage.removeItem('sp_fail'); localStorage.removeItem('sp_until');
        return showLibrary();
      }
      const fails = Number(localStorage.getItem('sp_fail') || 0) + 1;
      localStorage.setItem('sp_fail', fails);
      if (fails >= 5) localStorage.setItem('sp_until', Date.now() + Math.min(3600, 30 * 2 ** (fails - 5)) * 1000);
      msg.textContent = fails >= 5 ? 'Too many attempts. Please wait before trying again.' : 'Wrong PIN.';
      pin = '';
    } finally { working = false; paint(); }
  }

  const press = (d) => {
    if (working) return;
    msg.textContent = '';
    if (d === 'back') pin = pin.slice(0, -1);
    else if (pin.length < PIN_LEN) pin += d;
    paint();
    if (pin.length === PIN_LEN) submit();
  };

  const pad = h('div', { class: 'pad' },
    ...'123456789'.split('').map((d) => h('button', { onclick: () => press(d) }, d)),
    h('span'),
    h('button', { onclick: () => press('0') }, '0'),
    h('button', { 'aria-label': 'Delete', onclick: () => press('back') }, '⌫'));

  const forgot = setup ? null : h('button', {
    class: 'link', onclick: async () => {
      if (confirm('This permanently erases ALL scans and the PIN. Continue?')) {
        await S.eraseAll(); toast('All data erased'); lockView();
      }
    },
  }, 'Forgot PIN? Erase everything');

  paint();
  mount(h('section', { class: 'lock' }, h('div', { class: 'logo' }, '▣'), title, sub, dots, msg, pad, forgot));
}

// ---- Library --------------------------------------------------------------

let docs = [];

async function showLibrary() {
  docs = await S.listDocs();
  renderLibrary('');
}

function renderLibrary(query) {
  const q = query.toLowerCase();
  const list = docs.filter((d) => !q || d.name.toLowerCase().includes(q) || (d.ocr || '').toLowerCase().includes(q));
  const search = h('input', {
    type: 'search', placeholder: 'Search names and scanned text', value: query, class: 'search',
    oninput: (e) => { renderLibrary(e.target.value); const s = app.querySelector('.search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); },
  });

  const items = list.map((d) => {
    const img = h('img', { alt: '' });
    S.getPage(d.pages[0]).then((b) => { img.src = objUrl(b); }).catch(() => {});
    return h('button', { class: 'card', onclick: () => showDoc(d.id) },
      h('div', { class: 'thumb' }, img),
      h('div', { class: 'meta' },
        h('strong', {}, d.name),
        h('span', { class: 'muted' }, `${d.pages.length} page${d.pages.length === 1 ? '' : 's'} · ${new Date(d.created).toLocaleDateString()}`)));
  });

  mount(
    h('header', { class: 'bar' }, h('h1', {}, 'ScanPro'),
      h('button', { class: 'ghost', onclick: lockNow, 'aria-label': 'Lock' }, '🔒 Lock')),
    h('div', { class: 'content' }, search,
      items.length ? h('div', { class: 'list' }, items)
        : h('div', { class: 'empty' }, h('div', { class: 'big' }, '📄'),
          h('h2', {}, docs.length ? 'No matches' : 'Ready to scan'),
          h('p', { class: 'muted' }, docs.length ? 'Try a different search.'
            : 'Scans are not stored in the app. When you finish, they are saved as a PDF on your device and cleared from memory.'))),
    h('button', { class: 'fab', onclick: () => scanSheet(null) }, '📷  Scan'));
}

function lockNow() { S.lock(); docs = []; lockView(); }

// ---- Capture flow ---------------------------------------------------------

function pickFiles({ camera }) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept: 'image/*', ...(camera ? { capture: 'environment' } : { multiple: true }) });
    i.addEventListener('change', () => res([...i.files]));
    i.addEventListener('cancel', () => res([]));
    i.click();
  });
}

function sheet(content) {
  const back = h('div', { class: 'backdrop', onclick: (e) => e.target === back && back.remove() }, h('div', { class: 'sheet' }, content));
  document.body.append(back);
  return () => back.remove();
}

/** `target`: null = new document, or an existing doc meta to append to. `pending` keeps pages across rounds. */
function scanSheet(target, pending = []) {
  const close = sheet([
    h('h2', {}, 'Add pages'),
    h('button', { class: 'primary wide', onclick: async () => { const f = await pickFiles({ camera: true }); close(); processFiles(f, target, pending); } }, '📷  Take photo'),
    h('button', { class: 'wide', onclick: async () => { const f = await pickFiles({ camera: false }); close(); processFiles(f, target, pending); } }, '🖼  Choose from gallery'),
    h('button', { class: 'ghost wide', onclick: () => close() }, 'Cancel'),
  ]);
}

async function processFiles(files, target, pending) {
  if (!files.length) { if (pending.length) review(target, pending); return; }
  try {
    await busy('Loading scanner…', () => V.loadCV());
  } catch { toast('Could not load the scanner engine'); return; }
  for (const f of files) {
    try {
      const src = await busy('Reading photo…', () => V.fileToCanvas(f, 2000));
      const cropped = await cropStep(src);
      src.width = src.height = 0; // release the big bitmap right away
      if (!cropped) continue;
      const final = await filterStep(cropped, { title: 'Filter', confirmLabel: 'Add page' });
      // Keep only a compressed JPEG in memory (~100-300 KB) instead of a full-size bitmap (~16 MB).
      // `final` may be the same canvas as `cropped` (Original filter), so encode before releasing either.
      if (final) pending.push(await V.canvasToBlob(final, 0.8));
      cropped.width = cropped.height = 0;
      if (final) final.width = final.height = 0;
    } catch (e) { console.error(e); toast('Could not process that photo'); }
  }
  if (pending.length) review(target, pending);
  else target ? showDoc(target.id) : showLibrary();
}

// Crop with 4 draggable corners.
function cropStep(src) {
  return new Promise(async (resolve) => {
    let pts = await busy('Detecting edges…', async () => V.detectCorners(src));
    const W = src.width, H = src.height, r = Math.max(W, H) * 0.028;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.add('overlay');
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('class', 'quad');
    poly.setAttribute('stroke-width', r * 0.28);
    svg.append(poly);
    const handles = pts.map((_, i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', r); c.setAttribute('class', 'handle'); c.setAttribute('stroke-width', r * 0.2);
      c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); c.dataset.drag = '1'; });
      c.addEventListener('pointerup', () => { delete c.dataset.drag; });
      c.addEventListener('pointermove', (e) => {
        if (!c.dataset.drag) return;
        const b = svg.getBoundingClientRect();
        pts[i] = { x: Math.min(W, Math.max(0, (e.clientX - b.left) * W / b.width)), y: Math.min(H, Math.max(0, (e.clientY - b.top) * H / b.height)) };
        draw();
      });
      svg.append(c);
      return c;
    });
    function draw() {
      poly.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
      handles.forEach((c, i) => { c.setAttribute('cx', pts[i].x); c.setAttribute('cy', pts[i].y); });
    }
    draw();

    const display = h('canvas', { width: W, height: H });
    display.getContext('2d').drawImage(src, 0, 0);
    mount(
      h('header', { class: 'bar' }, h('button', { class: 'ghost', onclick: () => resolve(null) }, 'Skip'), h('h1', {}, 'Crop'),
        h('button', { class: 'ghost', onclick: () => { pts = V.fullRect(src, 0.0); draw(); } }, 'Full')),
      h('div', { class: 'stage' }, h('div', { class: 'stack' }, display, svg)),
      h('p', { class: 'hint' }, 'Drag the corners to fit the page edges.'),
      h('footer', { class: 'actions' }, h('button', {
        class: 'primary wide', onclick: async () => {
          const out = await busy('Cropping…', async () => V.warp(src, pts));
          resolve(out);
        },
      }, 'Crop ✓')));
  });
}

// Filter + rotate preview. Resolves with the final canvas, or null on cancel.
function filterStep(base, { title, confirmLabel, onDelete }) {
  return new Promise((resolve) => {
    let source = base, current = 'Magic', shown = base;
    const view = h('canvas');
    const chips = h('div', { class: 'chips' });

    async function render() {
      shown = await busy('Applying…', async () => V.applyFilter(source, current));
      view.width = shown.width; view.height = shown.height;
      view.getContext('2d').drawImage(shown, 0, 0);
      chips.replaceChildren(...V.FILTERS.map((f) => h('button', { class: 'chip' + (f === current ? ' on' : ''), onclick: () => { current = f; render(); } }, f)));
    }

    mount(
      h('header', { class: 'bar' }, h('button', { class: 'ghost', onclick: () => resolve(null) }, 'Cancel'), h('h1', {}, title),
        h('button', { class: 'ghost', onclick: () => { source = V.rotate90(source); render(); } }, '⟳ Rotate')),
      h('div', { class: 'stage' }, view),
      chips,
      h('footer', { class: 'actions row' },
        onDelete ? h('button', { class: 'danger', onclick: () => confirm('Delete this page?') && onDelete() }, '🗑') : null,
        h('button', { class: 'primary grow', onclick: () => resolve(shown) }, confirmLabel)));
    render();
  });
}

// Finish screen. Pages live only in memory (compressed JPEG blobs) until the user saves.
const defaultName = () => 'Scan ' + new Date().toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function discard(pending) { pending.length = 0; }

function review(target, pending) {
  const name = target ? null : h('input', { class: 'search', value: defaultName(), 'aria-label': 'File name', maxlength: 80 });
  const keep = h('input', { type: 'checkbox', id: 'keep' });
  const back = () => (target ? showDoc(target.id) : showLibrary());
  const kb = Math.round(pending.reduce((n, b) => n + b.size, 0) / 1024);

  const thumbs = pending.map((blob, i) => h('div', { class: 'pg' },
    h('img', { src: objUrl(blob), alt: `Page ${i + 1}` }), h('span', { class: 'num' }, i + 1),
    h('button', { class: 'x', 'aria-label': 'Remove page', onclick: () => { pending.splice(i, 1); pending.length ? review(target, pending) : back(); } }, '✕')));

  mount(
    h('header', { class: 'bar' },
      h('button', { class: 'ghost', onclick: () => { if (confirm('Discard these scans? They have not been saved.')) { discard(pending); back(); } } }, 'Discard'),
      h('h1', {}, `${pending.length} page${pending.length === 1 ? '' : 's'}`), h('span')),
    h('div', { class: 'content' },
      name,
      h('p', { class: 'muted small' }, `Held in memory only (~${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'}). Nothing is stored in the app unless you choose to.`),
      h('div', { class: 'grid' }, thumbs),
      target ? null : h('label', { class: 'keep', for: 'keep' }, keep, h('span', {}, 'Also keep an encrypted copy in this app')),
    ),
    h('footer', { class: 'actions row' },
      h('button', { class: 'grow', onclick: () => scanSheet(target, pending) }, '＋ Page'),
      h('button', { class: 'grow', onclick: () => ocrBlobs(pending) }, 'Aa Text'),
      target
        ? h('button', { class: 'primary grow', onclick: () => addToDoc(target, pending) }, 'Add to document')
        : h('button', { class: 'primary grow', onclick: () => finish(name.value, pending, keep.checked) }, '⤓ Save PDF')));
}

async function finish(rawName, pending, keepCopy) {
  const title = rawName.trim() || defaultName();
  try {
    const pdf = await busy('Building PDF…', (setMsg) => buildPDF(pending, title, setMsg));
    download(pdf, safeName(title) + '.pdf');
    if (keepCopy) await busy('Encrypting copy…', () => persist(null, pending, title));
  } catch (e) { console.error(e); toast('Could not create the PDF'); return; }
  discard(pending); // free the memory
  docs = await S.listDocs();
  showSaved(title, keepCopy);
}

function showSaved(title, kept) {
  mount(h('section', { class: 'lock' },
    h('div', { class: 'logo' }, '✓'), h('h1', {}, 'PDF saved'),
    h('p', { class: 'muted' }, `“${safeName(title)}.pdf” was sent to your device’s downloads. On iPhone: Files → Downloads. On Android: Downloads.`),
    h('p', { class: 'muted small' }, kept ? 'An encrypted copy is also kept in this app.' : 'No copy is kept in the app, and the scan has been cleared from memory.'),
    h('button', { class: 'primary wide', onclick: showLibrary }, 'Done')));
}

/** Writes pending JPEG blobs (encrypted) to a new or existing document. */
async function persist(target, pending, name) {
  const ids = [];
  for (const blob of pending) ids.push(await S.addPage(blob));
  const m = target ? { ...target, pages: [...target.pages, ...ids], ocr: null }
    : { id: crypto.randomUUID(), name: name || defaultName(), created: Date.now(), pages: ids, ocr: null };
  await S.saveDoc(m);
  return m;
}

async function addToDoc(target, pending) {
  const meta = await busy('Encrypting & saving…', () => persist(target, pending));
  discard(pending);
  toast('Added');
  showDoc(meta.id);
}

// ---- Document view --------------------------------------------------------

async function showDoc(id) {
  docs = await S.listDocs();
  const d = docs.find((x) => x.id === id);
  if (!d) return showLibrary();

  const tiles = d.pages.map((pid, i) => {
    const img = h('img', { alt: `Page ${i + 1}` });
    S.getPage(pid).then((b) => { img.src = objUrl(b); }).catch(() => {});
    return h('button', { class: 'pg', onclick: () => editPage(d, i) }, img, h('span', { class: 'num' }, i + 1));
  });

  mount(
    h('header', { class: 'bar' }, h('button', { class: 'ghost', onclick: showLibrary }, '‹ Back'),
      h('h1', { class: 'ell' }, d.name), h('button', { class: 'ghost', onclick: () => docMenu(d) }, '⋯')),
    h('div', { class: 'content' }, h('div', { class: 'grid' }, tiles)),
    h('footer', { class: 'actions row' },
      h('button', { class: 'grow', onclick: () => scanSheet(d) }, '＋ Pages'),
      h('button', { class: 'grow', onclick: () => textView(d) }, 'Aa Text'),
      h('button', { class: 'primary grow', onclick: () => exportView(d) }, '⤓ PDF')));
}

function docMenu(d) {
  const close = sheet([
    h('h2', {}, d.name),
    h('button', { class: 'wide', onclick: async () => {
      close();
      const n = prompt('Rename document', d.name);
      if (n && n.trim()) { await S.saveDoc({ ...d, name: n.trim() }); showDoc(d.id); }
    } }, '✏️  Rename'),
    h('button', { class: 'wide danger', onclick: async () => {
      close();
      if (!confirm('Delete this document permanently?')) return;
      await S.deleteDoc(d); toast('Deleted'); showLibrary();
    } }, '🗑  Delete document'),
    h('button', { class: 'ghost wide', onclick: () => close() }, 'Cancel'),
  ]);
}

async function editPage(d, i) {
  await busy('Opening…', () => V.loadCV());
  const blob = await S.getPage(d.pages[i]);
  const canvas = await V.fileToCanvas(blob, 3000);
  const result = await filterStep(canvas, {
    title: `Page ${i + 1}`, confirmLabel: 'Save changes',
    onDelete: async () => {
      if (d.pages.length === 1) { await S.deleteDoc(d); showLibrary(); return; }
      await S.deletePage(d.pages[i]);
      await S.saveDoc({ ...d, pages: d.pages.filter((_, j) => j !== i), ocr: null });
      toast('Page deleted'); showDoc(d.id);
    },
  });
  if (result) {
    await busy('Saving…', async () => {
      await S.putPage(d.pages[i], await V.canvasToBlob(result));
      await S.saveDoc({ ...d, ocr: null });
    });
    toast('Saved');
  }
  if (S.isUnlocked()) showDoc(d.id);
}

// ---- OCR text -------------------------------------------------------------

async function recognize(blobs) {
  return busy('Reading text…', async (setMsg) => {
    const canvases = [];
    for (const blob of blobs) canvases.push(await V.fileToCanvas(blob, 2600));
    try { return await V.ocr(canvases, (i, n) => setMsg(`Reading page ${i} of ${n}…`)); }
    finally { canvases.forEach((c) => { c.width = c.height = 0; }); }
  }).catch((e) => { console.error(e); toast('Text recognition failed'); return null; });
}

function showText(text, title, onClose) {
  const close = sheet([
    h('h2', {}, 'Scanned text'),
    h('pre', { class: 'text' }, text || 'No text found.'),
    h('div', { class: 'row' },
      h('button', { class: 'grow', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy not allowed'); } } }, 'Copy'),
      h('button', { class: 'grow', onclick: () => download(new Blob([text], { type: 'text/plain' }), safeName(title) + '.txt') }, 'Save .txt'),
      h('button', { class: 'grow ghost', onclick: () => { close(); onClose?.(); } }, 'Close')),
  ]);
}

// Text for pages that exist only in memory (nothing is stored).
async function ocrBlobs(pending) {
  const text = await recognize(pending);
  if (text != null) showText(text, 'scan-text');
}

// Text for a kept (stored) document; cached inside the encrypted record.
async function textView(d) {
  let text = d.ocr;
  if (text == null) {
    const blobs = [];
    for (const pid of d.pages) blobs.push(await S.getPage(pid));
    text = await recognize(blobs);
    if (text == null) return;
    await S.saveDoc({ ...d, ocr: text });
  }
  showText(text, d.name, () => showDoc(d.id));
}

// ---- PDF export (download only; no sharing) -------------------------------

const safeName = (n) => n.replace(/[\\/:*?"<>|,]+/g, '-').trim() || 'scan';

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

/** Builds a PDF from JPEG blobs, one page per image, and returns it as a Blob. */
async function buildPDF(blobs, title, setMsg) {
  const { jsPDF } = window.jspdf;
  let pdf = null;
  for (let i = 0; i < blobs.length; i++) {
    setMsg?.(`Building PDF… ${i + 1}/${blobs.length}`);
    const data = await blobToDataURL(blobs[i]);
    const dim = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.src = data; });
    const w = 595, hgt = Math.round(595 * dim[1] / dim[0]);
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, hgt], orientation: hgt >= w ? 'p' : 'l', compress: true });
    else pdf.addPage([w, hgt], hgt >= w ? 'p' : 'l');
    pdf.addImage(data, 'JPEG', 0, 0, w, hgt, undefined, 'FAST');
    await nextPaint();
  }
  pdf.setProperties({ title, creator: 'ScanPro' });
  return pdf.output('blob');
}

// Kept documents: export a PDF to the device's downloads.
async function exportView(d) {
  const blob = await busy('Building PDF…', async (setMsg) => {
    const blobs = [];
    for (const pid of d.pages) blobs.push(await S.getPage(pid));
    return buildPDF(blobs, d.name, setMsg);
  }).catch((e) => { console.error(e); toast('PDF failed'); return null; });
  if (!blob) return;
  download(blob, safeName(d.name) + '.pdf');
  toast('PDF saved to your downloads');
}

// ---- boot / auto-lock -----------------------------------------------------

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (S.isUnlocked() && Date.now() - hiddenAt > AUTOLOCK_MS) { document.querySelectorAll('.backdrop').forEach((n) => n.remove()); lockNow(); }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

lockView();
